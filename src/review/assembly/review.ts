import { logging, RNG, } from "near-sdk-as";

@nearBindgen
export class Review {
  private is_accept: bool = false
  private comment: string = ""
  explain(): string {
    return "Reviewers review a video and receive tokens as reward, the minmum reward rate is 10% and maximum is 30%";
  }

  accept(): void {
    this.is_accept = true
  }

  reject(): void {
    this.is_accept = false
  }

  configure(): void {
    logging.log(this.explain());
  }
}
