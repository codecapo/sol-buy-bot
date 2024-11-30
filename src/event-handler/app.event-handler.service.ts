import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppService } from '../service/app.service';

@Injectable()
export class AppEventHandlerService {
  constructor(private readonly appService: AppService) {}

  // Create the promise
  private async uuidPromise() {
    return new Promise<string>((resolve) => {
      const uuid = crypto.randomUUID();
      console.log(`Generated UUID: ${uuid}`);

      let secondsLeft = 5;

      // Display countdown message every second
      const interval = setInterval(() => {
        console.log(
          `Waiting... ${secondsLeft} seconds remaining for uuid ${uuid}`,
        );
        secondsLeft--;

        if (secondsLeft === 0) {
          clearInterval(interval);
          resolve(uuid);
        }
      }, 1000);
    });
  }

  // @OnEvent('test.event', { async: true })
  // handleTestEvent(payload: TestEvent) {
  //   console.log(`Got event event ${JSON.stringify(payload)}`);
  //   this.uuidPromise();
  // }

  @OnEvent('execute.swaps', { async: true })
  handleExecuteParallelSwapEvent() {
    this.appService.mapSwapRequests().then((r) => {
      console.log(JSON.stringify(r));
    });
  }
}
