import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import type { Config } from './config.js';
import type { JobExecutor } from './providers.js';
import { ApiFailure } from './errors.js';

export type MemoryCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function createDittoMemory(config: Config, suppliedCall?: MemoryCall) {
  const call: MemoryCall = suppliedCall ?? (async (name, args) => {
    const client = new Client({ name: 'subswarm', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL('https://api.heyditto.ai/mcp'), {
        requestInit: { headers: { Authorization: `Bearer ${config.dittoApiKey}` }, signal: AbortSignal.timeout(60_000) },
      }));
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) throw new Error('Invalid memory response');
      if (result.structuredContent) return result.structuredContent;
      const text = Array.isArray(result.content) ? result.content.find(item => item.type === 'text') : undefined;
      if (!text || typeof text.text !== 'string') throw new Error('Missing memory response');
      return JSON.parse(text.text);
    } catch {
      throw new ApiFailure('memory_request_failed', 'Ditto could not complete this memory operation. No automatic retry was sent.', 502);
    } finally { await client.close().catch(() => {}); }
  });
  const requireSpace = (space = config.dittoSpace) => {
    if (!config.dittoApiKey || !space || space === 'main') throw new ApiFailure('memory_unavailable', 'A dedicated Ditto storage space must be configured.', 503);
    return space;
  };
  const execute: JobExecutor = async (input, context) => {
    const space = requireSpace();
    if (!context?.jobId || input.providerId !== 'ditto' || !input.prompt) throw new ApiFailure('invalid_input', 'A note and a server-owned request are required.', 422);
    const saved = z.object({ id: z.uuid(), status: z.literal('saved') }).safeParse(await call('save_memory', {
      content: input.prompt, source: 'subswarm', vendorId: context.jobId, routing: 'manual', space,
    }));
    if (!saved.success) throw new ApiFailure('invalid_provider_response', 'Ditto did not confirm a saved note.', 502);
    context.onProviderTaskCreated?.(saved.data.id);
    return { title: 'Ditto saved note', text: input.prompt, memoryId: saved.data.id, memorySpace: space,
      blocks: [{ type: 'memory', jobId: context.jobId, text: input.prompt }] };
  };
  return {
    execute,
    async retrieve(memoryId: string, space: string) {
      requireSpace(space);
      const result = z.object({ memories: z.array(z.object({ id: z.string(), content: z.string().max(100_000) })).length(1) }).safeParse(await call('fetch_memories', { ids: [memoryId], space, format: 'full' }));
      if (!result.success || result.data.memories[0].id !== memoryId) throw new ApiFailure('invalid_provider_response', 'Ditto did not return the requested note.', 502);
      return result.data.memories[0].content;
    },
    async remove(memoryId: string, space: string) {
      requireSpace(space);
      const result = z.object({ memoryId: z.string(), status: z.literal('deleted') }).safeParse(await call('delete_memory', { memoryId, space, confirm: true }));
      if (!result.success || result.data.memoryId !== memoryId) throw new ApiFailure('memory_delete_failed', 'Ditto did not confirm deletion of this note.', 502);
    },
  };
}
