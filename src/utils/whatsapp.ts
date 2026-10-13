export const buildWhatsAppUrl = (phone: string | undefined, message: string): string | null => {
  const normalizedPhone = phone?.replace(/\D/g, '').replace(/^00/, '') || '';
  if (normalizedPhone.length < 8 || normalizedPhone.length > 15) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
};
