import { describe, expect, it, vi } from 'vitest';
import {
  fulfillCollectionSlotPayment,
  type CollectionSlotRpc,
} from './collectionSlotFulfillment.js';

describe('collection slot payment fulfillment', () => {
  it('uses the atomic fulfillment RPC and returns the resulting slot count', async () => {
    const rpc = vi.fn<CollectionSlotRpc>().mockResolvedValue({ data: 6, error: null });
    const providerData = { status: 'success', amount: 50000 };

    await expect(fulfillCollectionSlotPayment(rpc, 'FABS-SLOT-test', providerData)).resolves.toBe(6);
    expect(rpc).toHaveBeenCalledWith('activate_collection_slot_payment', {
      p_reference: 'FABS-SLOT-test',
      p_provider_data: providerData,
    });
  });

  it('surfaces database errors instead of treating fulfillment as successful', async () => {
    const error = { message: 'Database unavailable' };
    const rpc = vi.fn<CollectionSlotRpc>().mockResolvedValue({ data: null, error });

    await expect(fulfillCollectionSlotPayment(rpc, 'FABS-SLOT-test')).rejects.toBe(error);
  });
});
