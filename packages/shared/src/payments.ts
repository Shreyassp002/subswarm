export interface WalletState {
  address: string | null;
  availableRao: string;
  reservedRao: string;
}

export interface PaymentSettings {
  enabled: boolean;
  network: 'testnet';
  receiver: string | null;
  genesisHash: string;
  rpcUrl: string;
  maxDepositRao: string;
  pricesRao: Record<string, string>;
  reason?: string;
}

export interface PaymentQuote {
  storageRetentionDays?: number;
  id: string;
  providerId: string;
  amountRao: string;
  expiresAt: string;
}

export interface PaymentLedgerEntry {
  id: string;
  kind: 'deposit' | 'request';
  status: 'credited' | 'reserved' | 'charged' | 'released';
  amountRao: string;
  createdAt: string;
  providerId?: string;
  jobId?: string;
  blockHash?: string;
}
