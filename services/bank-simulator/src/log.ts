export function log(message: string): void {
  console.log(`[bank] ${new Date().toISOString()} ${message}`);
}
