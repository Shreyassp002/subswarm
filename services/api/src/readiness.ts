import type { Config } from './config.js';
import { providerCatalog } from './provider-catalog.js';
import { paymentSettings } from './payments.js';

export function configurationReport(config: Config, registryAvailable: boolean) {
  const requirements: Record<string, [string, unknown][]> = {
    bitmind: [['BITMIND_API_KEY', config.bitmindApiKey]], zeus: [['ZEUS_API_KEY', config.zeusApiKey]],
    ditto: [['DITTO_MCP_API_KEY', config.dittoApiKey], ['DITTO_SPACE', config.dittoSpace]],
    saygm: [['SAYGM_API_KEY', config.saygmApiKey]], chutes: [['CHUTES_API_KEY', config.chutesApiKey]],
    desearch: [['DESEARCH_API_KEY', config.desearchApiKey]], chronoseek: [['CHRONOSEEK_URL', config.chronoseekUrl]],
    '404gen': [['GEN404_API_KEY', config.gen404ApiKey]], attelier: [['ATTELIER_API_KEY', config.attelierApiKey], ['ATTELIER_MODEL', config.attelierModel]],
    hippius: [['HIPPIUS_ACCESS_KEY_ID', config.hippiusAccessKey], ['HIPPIUS_SECRET_ACCESS_KEY', config.hippiusSecretKey], ['HIPPIUS_BUCKET', config.hippiusBucket]],
  };
  const payment = paymentSettings(config.payments);
  return {
    network: 'testnet', liveVerification: 'not_performed',
    payments: { enabled: payment.enabled, receiverConfigured: !!config.payments?.receiver, depositWindowConfigured: !!config.payments?.startBlock },
    providers: providerCatalog(config, registryAvailable).map(provider => ({
      id: provider.id,
      status: provider.status === 'external' ? 'external_only' : provider.status === 'ready' ? 'configured_unverified' : 'configuration_required',
      missing: (requirements[provider.id] ?? []).filter(([, value]) => !value).map(([key]) => key),
      priceConfigured: provider.id === 'network' || !!config.payments?.pricesRao[provider.id],
      ...(provider.status === 'external' ? { reason: provider.reason } : {}),
    })),
    notes: ['Presence of credentials does not verify access, credit or supported models.', '404-GEN image input also needs GEN404_IMAGE_ORIGINS. ChronoSeek may need gateway authentication.', 'Attelier model-specific parameters and a private Hippius bucket must match provider configuration.'],
  };
}
