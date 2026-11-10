/** The bank answered with an HTTP error (httpStatus set) or could not be reached / timed out (no httpStatus). */
export class BankError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'BankError';
  }
}
