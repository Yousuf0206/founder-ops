/**
 * The connector error taxonomy (002 T2.4). Every platform client maps its
 * failures onto these kinds, so the executor handles every platform alike.
 *
 *   token_revoked   the platform rejected the token → account expired, reconnect
 *   rate_limited    try again later; nothing was posted
 *   rejected        the platform refused the content or the request
 *   outcome_unknown the request may have been accepted — never retry blindly
 *   unavailable     the platform failed before accepting anything
 *   misconfigured   our side: missing client id, secret, or API version
 */

export type ConnectorErrorKind =
  | "token_revoked"
  | "rate_limited"
  | "rejected"
  | "outcome_unknown"
  | "unavailable"
  | "misconfigured";

export class ConnectorError extends Error {
  constructor(
    readonly kind: ConnectorErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
