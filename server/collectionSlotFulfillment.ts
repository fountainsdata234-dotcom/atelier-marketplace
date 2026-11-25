export type CollectionSlotRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

export const fulfillCollectionSlotPayment = async (
  rpc: CollectionSlotRpc,
  reference: string,
  providerData: Record<string, unknown> = {},
): Promise<number> => {
  const { data, error } = await rpc('activate_collection_slot_payment', {
    p_reference: reference,
    p_provider_data: providerData,
  });

  if (error) throw error;
  if (typeof data !== 'number' || !Number.isInteger(data) || data < 0 || data > 28) {
    throw new Error('Collection slot fulfillment returned an invalid slot count.');
  }

  return data;
};
