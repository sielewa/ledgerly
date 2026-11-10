/** What happened to a consumed payment.* event: inbox decides 'duplicate', the state machine 'stale'. */
export type PaymentEventResult = 'applied' | 'duplicate' | 'stale';
