import { logging, Context, u128, ContractPromiseBatch, PersistentSet, PersistentMap, PersistentVector } from "near-sdk-as";

import { AccountId, ONE_NEAR, asNEAR, XCC_GAS } from "../../utils";

import { FeeStrategy, StrategyType } from "./fee-strategies";
import { Review } from "./review";


@nearBindgen
export class Contract {

  private owner: AccountId;
  private active: bool = true;
  private fee_strategy: FeeStrategy = new FeeStrategy();
  private review: Review = new Review();
  private accepted_accounts: PersistentSet<AccountId> = new PersistentSet<AccountId>("aa");
  private accepted_map: PersistentMap<AccountId, u128> = new PersistentMap<AccountId, u128>("am");
  private rejected_accounts: PersistentSet<AccountId> = new PersistentSet<AccountId>("ra");
  private rejected_map: PersistentMap<AccountId, u128> = new PersistentMap<AccountId, u128>("rm");

  constructor(owner: AccountId) {
    this.owner = owner;
  };

  // --------------------------------------------------------------------------
  // Public VIEW methods
  // --------------------------------------------------------------------------

  get_owner(): AccountId {
    return this.owner;
  }

  get_result(): string {
    
    if(this.accepted_accounts.size + this.rejected_accounts.size >= 3
        && this.accepted_accounts.size > this.rejected_accounts.size) {
      return "Accepted"
    } else {
      return "Rejected"
    }
  }

  get_fee(): string {
    return asNEAR(this.fee()) + " NEAR";
  }

  get_fee_strategy(): StrategyType {
    return this.fee_strategy.strategy
  }

  get_has_reviwed(reviewer_id: AccountId): bool {
    logging.log(this.accepted_accounts.size)
    return this.accepted_accounts.has(reviewer_id) || this.rejected_accounts.has(reviewer_id)
  }

  get_active(): bool {
    return this.active;
  }

  explain_fees(): string {
    return FeeStrategy.explain()
  }

  explain_review(): string {
    return this.review.explain()
  }

  // --------------------------------------------------------------------------
  // Public CHANGE methods
  // --------------------------------------------------------------------------

  /**
   * "Pay to play"
   *
   * First time is free to play and you may win!
   *
   * If you've already played once then any other play costs you a fee.
   * This fee is calculated as 1 NEAR X the square of the total number of unique players
   */
  @mutateState()
  submit(result: bool): void {
    assert(this.active, "Video reviewed.");
    const signer = Context.sender;
    const pay = Context.attachedDeposit;
    
    if(this.get_has_reviwed(signer)) {
      logging.log("You submited the result before");
      return
    }
    logging.log(signer)
    if(result) {
      this.accepted_accounts.add(signer);
      this.accepted_map.set(signer, pay);
    } else {
      this.rejected_accounts.add(signer);
      this.rejected_map.set(signer, pay);
    }
    
    logging.log("Your submission recorded successfully")
    
    if (this.is_completed()) {
      const result = this.get_result() == "Accepted"
      this.payout(result);
    } else {
      logging.log("The video is under process");
    }
    
    
  }

  @mutateState()
  configure_review(): bool {
    this.assert_self();
    this.review.configure();
    return true;
  }

  @mutateState()
  configure_fee(strategy: StrategyType): bool {
    this.assert_self();
    this.fee_strategy = new FeeStrategy(strategy);
    return true;
  }

  @mutateState()
  reset_contract(): void {
    this.assert_self();
    this.accepted_accounts.clear();
    this.accepted_map = new PersistentMap<AccountId, u128>("am");
    this.rejected_accounts.clear();
    this.rejected_map = new PersistentMap<AccountId, u128>("rm");
    this.active = true;
    logging.log("Reset contract completed")
  }

  // this method is only here for the promise callback,
  // it should never be called directly
  @mutateState()
  on_payout_complete(): void {
    logging.log("Transfered");
  }

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------

  private fee(): u128 {
    return this.fee_strategy.calculate_fee(this.accepted_accounts.size + this.rejected_accounts.size, ONE_NEAR);
  }

  private is_completed(): bool {
    logging.log(this.accepted_accounts.size + this.rejected_accounts.size)
    return this.accepted_accounts.size + this.rejected_accounts.size >= 3
  }

  private lose(): void {
    logging.log("The video still under review process");
  }

  private payout(is_accept: bool): void {
    this.active = false;
    if(is_accept) {
      logging.log("This video is accepted");
      const accepteds = this.accepted_accounts.values();
      for(var i = 0; i < accepteds.length; i ++) {
        const account_id = accepteds[i];
        const pay = this.accepted_map.get(account_id) as u128;
        const to_winner = ContractPromiseBatch.create(account_id);
        const self = Context.contractName

        // transfer payout to winner
        to_winner.transfer(u128.mul(pay, u128.fromI32(2)));

        // receive confirmation of payout before setting game to inactive
        to_winner.then(self).function_call("on_payout_complete", '{}', u128.Zero, XCC_GAS);
      }
      
    } else {
      logging.log("This video is rejected");
      const rejecteds = this.rejected_accounts.values();
      for(var j = 0; j < rejecteds.length; j ++) {
        const account_id = rejecteds[j];
        const pay = this.rejected_map.get(account_id) as u128;
        const to_winner = ContractPromiseBatch.create(account_id);
        const self = Context.contractName

        // transfer payout to winner
        to_winner.transfer(u128.mul(pay, u128.fromI32(2)));

        // receive confirmation of payout before setting game to inactive
        to_winner.then(self).function_call("on_payout_complete", '{}', u128.Zero, XCC_GAS);
      }
    }
  }

  private generate_fee_message(fee: u128): string {
    return ("There are " + this.accepted_accounts.size + this.rejected_accounts.size +
      + " players. Playing more than once now costs " + asNEAR(fee)
      + " NEAR");
  }

  private assert_self(): void {
    const caller = Context.predecessor
    const self = Context.contractName
    assert(caller == self, "Only this contract may call itself");
  }
}
