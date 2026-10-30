import { STORAGE_RETENTION_DAYS } from './storage-policy.js';
import type { Provider, ProviderInputField } from '@subswarm/shared';
import type { Config } from './config.js';

const textInputs: ProviderInputField[] = [
  { key: 'prompt', type: 'textarea', label: 'Instructions', description: 'Describe what you want the model to write or explain.', required: true, maxLength: 4000, placeholder: 'Explain how Bittensor validators evaluate miners in plain language.' },
  { key: 'maxTokens', type: 'number', label: 'Maximum output tokens', description: 'An upper bound on the response length, not a price quote.', required: false, min: 1, max: 1200, defaultValue: 256 },
];

export function providerCatalog(config: Config, networkAvailable: boolean): Provider[] {
  const providers: Provider[] = [
    {
      id: 'network', name: 'Network Explorer', netuid: 298, network: 'testnet', category: 'Network',
      description: 'Inspect registered participants on Bittensor testnet without a wallet.',
      status: networkAvailable ? 'ready' : 'unavailable', taskKind: 'network-scan', attribution: 'registered-participants',
      website: 'https://www.bittensor.com', docsUrl: 'https://docs.learnbittensor.org/',
      inputs: [{ key: 'netuid', type: 'select', label: 'Testnet subnet', required: true, defaultValue: 298, options: [{ label: '298 - ChronoSeek', value: 298 }, { label: '482 - SayGM', value: 482 }] }],
      inputDescription: 'Choose a supported testnet subnet.',
      outputDescription: 'A chain snapshot with block, participant UIDs, hotkeys, roles and advertised endpoints. Registration does not prove request execution.',
      exampleInput: { providerId: 'network', netuid: 298 },
      reason: networkAvailable ? undefined : 'The read-only chain CLI is not configured on this server.',
    },
    {
      id: 'saygm', name: 'SayGM', netuid: 28, network: 'mainnet', category: 'Text',
      description: 'Write, summarize or explain with a text model through the SayGM gateway.',
      status: config.saygmApiKey ? 'ready' : 'needs_key', taskKind: 'text', attribution: 'none',
      website: 'https://saygm.com', docsUrl: 'https://docs.saygm.com/getting-started/quickstart/',
      inputs: textInputs, inputDescription: 'Text instructions and an output token limit.',
      outputDescription: 'Generated text and the model used. The hosted gateway does not supply verified miner attribution.',
      exampleInput: { providerId: 'saygm', prompt: 'Explain how Bittensor validators evaluate miners in plain language.', maxTokens: 256 },
      reason: config.saygmApiKey ? undefined : 'A server-side SayGM API key is required. Provider credit and model availability are checked when a request runs.',
    },
    {
      id: 'desearch', name: 'Desearch', netuid: 22, network: 'mainnet', category: 'Search',
      description: 'Find web pages for a search query and keep their source links.',
      status: config.desearchApiKey ? 'ready' : 'needs_key', taskKind: 'search', attribution: 'none',
      website: 'https://www.desearch.ai', docsUrl: 'https://www.desearch.ai/docs',
      inputs: [
        { key: 'prompt', type: 'textarea', label: 'Search query', required: true, maxLength: 4000, placeholder: 'Bittensor subnet evaluation documentation' },
        { key: 'start', type: 'number', label: 'Result offset', description: 'Skip this many results. Zero starts with the first page.', required: false, min: 0, max: 100, defaultValue: 0 },
      ],
      inputDescription: 'A web search query and optional result offset.',
      outputDescription: 'Search results with a title, excerpt and original source URL. An empty result set is preserved.',
      exampleInput: { providerId: 'desearch', prompt: 'Bittensor subnet evaluation documentation', start: 0 },
      reason: config.desearchApiKey ? undefined : 'A server-side Desearch API key with available provider credit is required.',
    },
    {
      id: 'chronoseek', name: 'ChronoSeek', netuid: 298, network: 'testnet', category: 'Video',
      description: 'Find the moments in an existing video that match a description.',
      status: config.chronoseekUrl ? 'ready' : 'unavailable', taskKind: 'video-search', attribution: 'query-uids',
      website: 'https://chronoseek.ai',
      inputs: [
        { key: 'videoUrl', type: 'url', label: 'Source video URL', description: 'A public HTTPS video the configured gateway can access.', required: true, maxLength: 2048, placeholder: 'https://example.com/your-video.mp4' },
        { key: 'prompt', type: 'textarea', label: 'Moment to find', required: true, maxLength: 4000, placeholder: 'A person opens the door and walks outside.' },
        { key: 'topK', type: 'number', label: 'Maximum matching moments', required: false, min: 1, max: 20, defaultValue: 5 },
      ],
      inputDescription: 'An existing video URL, a description of an event, and a maximum number of matches.',
      outputDescription: 'Start and end times with confidence scores and a source-video link. Participant UIDs appear only when the gateway reports them for this request.',
      exampleInput: { providerId: 'chronoseek', prompt: 'A person opens the door and walks outside.', topK: 5 },
      reason: config.chronoseekUrl ? undefined : 'A reachable ChronoSeek validator gateway must be configured. This service searches video; it does not generate it.',
    },
    {
      id: 'chutes', name: 'Chutes', netuid: 64, network: 'mainnet', category: 'Text',
      description: 'Draft, reason and answer questions through a hosted Chutes text model.',
      status: config.chutesApiKey ? 'ready' : 'needs_key', taskKind: 'text', attribution: 'none',
      website: 'https://chutes.ai', docsUrl: 'https://docs.chutes.ai/',
      inputs: textInputs, inputDescription: 'Text instructions and an output token limit.',
      outputDescription: 'Generated text and the selected model. This adapter supports text chat, not the full Chutes image or compute catalog.',
      exampleInput: { providerId: 'chutes', prompt: 'Write a short welcome message for a village of AI services.', maxTokens: 400 },
      reason: config.chutesApiKey ? undefined : 'A server-side Chutes API key with available provider credit is required.',
    },
    {
      id: '404gen', name: '404-GEN', netuid: 17, network: 'mainnet', category: '3D',
      description: 'Generate a downloadable 3D asset from text or a reference image.',
      status: config.gen404ApiKey ? 'ready' : 'needs_key', taskKind: '3d', attribution: 'none', website: 'https://gen.404.xyz',
      docsUrl: 'https://github.com/404-Repo/gateway-rs/blob/main/docs/api/client_api.md',
      inputs: [
        { key: 'model', type: 'select', label: '3D output', required: true, defaultValue: '404-3dgs', options: [{ label: 'Gaussian splat (.spz) - text or image', value: '404-3dgs' }, { label: 'Mesh (.glb) - image only', value: '404-mesh' }] },
        { key: 'prompt', type: 'textarea', label: 'Text description', description: 'Use a text description OR an image URL. Mesh output requires an image.', required: false, maxLength: 4000, placeholder: 'A small wooden treasure chest with brass hinges.' },
        { key: 'inputImageUrl', type: 'url', label: 'Reference image URL', description: config.gen404ImageOrigins?.length ? `PNG or JPEG, at most 8 MiB. Allowed origins: ${config.gen404ImageOrigins.join(', ')}.` : 'Image input is disabled until the server enables an image origin. Text-to-splat generation remains available.', required: false, maxLength: 2048 },
      ],
      inputDescription: 'Supply either a text description or a PNG/JPEG URL from a server-approved host. Mesh generation requires an image.',
      outputDescription: 'A downloadable SPZ splat or GLB mesh after the provider reports completion. Files are fetched privately from the provider, with a 32 MiB download limit. No miner identity is inferred.',
      exampleInput: { providerId: '404gen', model: '404-3dgs', prompt: 'A small wooden treasure chest with brass hinges.' },
      reason: config.gen404ApiKey ? undefined : 'A server-side 404-GEN API key and provider credit are required. Generation can take several minutes.',
    },
    {
      id: 'attelier', name: 'Attelier', netuid: 126, network: 'mainnet', category: 'Video',
      description: 'Create video, images or audio with model-specific media tools.',
      status: config.attelierApiKey && config.attelierModel ? 'ready' : 'needs_key', taskKind: 'media', attribution: 'none', website: 'https://attelier.ai', docsUrl: 'https://docs.attelier.ai/',
      inputs: [{ key: 'prompt', type: 'textarea', label: 'Describe your creation', required: true, maxLength: 4000, placeholder: 'A tiny village under a warm evening sky.' }],
      inputDescription: 'A text prompt for the operator-configured media model and generation settings.',
      outputDescription: 'Private image, video or audio outputs, with authenticated downloads and verified file integrity.',
      exampleInput: { providerId: 'attelier', prompt: 'A tiny village under a warm evening sky.' },
      reason: config.attelierApiKey && config.attelierModel ? undefined : 'An Attelier API Console key, funded USD API balance and model configuration are required. App credits are separate.',
    },
    {
      id: 'everyframe', name: 'EveryFrame', netuid: 117, network: 'mainnet', category: 'Video',
      description: 'Create and edit videos and images in the EveryFrame Studio.',
      status: 'external', taskKind: null, attribution: 'none', website: 'https://everyframe.studio', docsUrl: 'https://docs.everyframe.studio/studio/faq/', inputs: [],
      inputDescription: 'Choose a model, prompt and supported reference media in Studio, then review its quote.',
      outputDescription: 'Generated media in the provider library, with download and editing tools. Available inputs and formats depend on the selected model.',
      reason: 'EveryFrame documents no third-party customer generation API. Use Studio; its miner CLI is not a customer rendering API.',
    },
    {
      id: 'hippius', name: 'Hippius', netuid: 75, network: 'mainnet', category: 'Storage',
      description: 'Store and retrieve files with Drive or S3-compatible object storage.',
      status: config.hippiusAccessKey && config.hippiusSecretKey && config.hippiusBucket ? 'ready' : 'needs_key', taskKind: 'storage', attribution: 'none', website: 'https://console.hippius.com', docsUrl: 'https://docs.hippius.com/',
      inputs: [{ key: 'fileBase64', type: 'file', label: 'Pack a file', required: true, description: `Up to 256 KiB, kept for ${STORAGE_RETENTION_DAYS} days. Download or delete it from the journal.` }],
      inputDescription: 'Upload a small file into the village storage account.',
      outputDescription: `A private file stored for ${STORAGE_RETENTION_DAYS} days with download and delete controls. Keep your own backup.`,
      reason: config.hippiusAccessKey && config.hippiusSecretKey && config.hippiusBucket ? undefined : 'Hippius S3 access keys and a private bucket are required.',
    },
    {
      id: 'ridges', name: 'Ridges', netuid: 62, network: 'mainnet', category: 'Code',
      description: 'Send repository issues to a coding agent through Ridgeline.',
      status: 'external', taskKind: null, attribution: 'none', website: 'https://app.ridges.ai', docsUrl: 'https://docs.ridges.ai/', inputs: [],
      inputDescription: 'Connect a GitHub repository and describe the software change in an issue.',
      outputDescription: 'A proposed code change delivered as a pull request for your review. Competition leaderboards do not identify the worker for a particular customer job.',
      reason: 'Ridgeline runs in its own GitHub-connected service. Its documented API requires Base mainnet USDC, outside this testnet village.',
    },
  ];
  return providers.map(provider => config.payments?.enabled && provider.status === 'ready' && provider.id !== 'network' && !config.payments.pricesRao[provider.id]
    ? { ...provider, status: 'unavailable', reason: 'Requests are not enabled for this service yet. No payment will be taken.' }
    : provider);
}
