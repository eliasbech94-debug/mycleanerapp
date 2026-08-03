/** Shape of the conversation object shared by the support inbox surfaces. */
export interface SupportConversation {
  id: string;
  status: string;
  priority: string | null;
  booking_id?: string | null;
  assigned_support_id?: string | null;
  [key: string]: unknown;
}
