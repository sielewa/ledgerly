import { Controller } from '@nestjs/common';
import { ledgerV1 } from '@ledgerly/proto';
import { invalidArgument } from '../../shared/errors';
import { LedgerService } from '../application/ledger.service';
import {
  requireCurrency,
  requireIdempotencyKey,
  requirePositiveAmount,
  requireUuid,
} from './validation';

/**
 * gRPC API. Thin transport layer: validate the request, then hand it to the use case unchanged (the request is
 * hashed for idempotency, see LedgerService). No business logic here.
 */
@Controller()
@ledgerV1.LedgerServiceControllerMethods()
export class LedgerGrpcController implements ledgerV1.LedgerServiceController {
  constructor(private readonly ledger: LedgerService) {}

  openAccount(req: ledgerV1.OpenAccountRequest) {
    requireIdempotencyKey(req.idempotencyKey);
    requireCurrency(req.currency);
    if (req.code.trim() === '') throw invalidArgument('code is required');
    return this.ledger.openAccount(req);
  }

  postDeposit(req: ledgerV1.PostDepositRequest) {
    requireIdempotencyKey(req.idempotencyKey);
    requireUuid(req.accountId, 'account_id');
    requirePositiveAmount(req.amount);
    return this.ledger.postDeposit(req);
  }

  getBalance(req: ledgerV1.GetBalanceRequest) {
    requireUuid(req.accountId, 'account_id');
    return this.ledger.getBalance(req);
  }

  placeHold(req: ledgerV1.PlaceHoldRequest) {
    requireIdempotencyKey(req.idempotencyKey);
    requireUuid(req.accountId, 'account_id');
    requirePositiveAmount(req.amount);
    return this.ledger.placeHold(req);
  }

  captureHold(req: ledgerV1.CaptureHoldRequest) {
    requireIdempotencyKey(req.idempotencyKey);
    requireUuid(req.holdId, 'hold_id');
    return this.ledger.captureHold(req);
  }

  releaseHold(req: ledgerV1.ReleaseHoldRequest) {
    requireIdempotencyKey(req.idempotencyKey);
    requireUuid(req.holdId, 'hold_id');
    return this.ledger.releaseHold(req);
  }
}
