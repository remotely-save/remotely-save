import {
  Cipher as CipherRCloneCryptPack,
  encryptedSize,
} from "@fyears/rclone-crypt";

// @ts-ignore
import EncryptWorker from "./encryptRClone.worker";

interface RecvMsg {
  status: "ok" | "error";
  outputName?: string;
  outputContent?: ArrayBuffer;
  error?: any;
}

export const getSizeFromOrigToEnc = encryptedSize;

export class CipherRclone {
  readonly password: string;
  readonly cipher: CipherRCloneCryptPack;
  readonly workers: Worker[];
  init: boolean;
  workerIdx: number;
  constructor(password: string, workerNum: number) {
    this.password = password;
    this.init = false;
    this.workerIdx = 0;

    // console.debug("begin creating CipherRCloneCryptPack");
    this.cipher = new CipherRCloneCryptPack("base64");
    // console.debug("finish creating CipherRCloneCryptPack");

    // console.debug("begin creating EncryptWorker");
    this.workers = [];
    for (let i = 0; i < workerNum; ++i) {
      this.workers.push(new (EncryptWorker as any)() as Worker);
    }

    // console.debug("finish creating EncryptWorker");
  }

  closeResources() {
    for (let i = 0; i < this.workers.length; ++i) {
      this.workers[i].terminate();
    }
  }

  async prepareByCallingWorker(): Promise<void> {
    if (this.init) {
      return;
    }
    // console.debug("begin prepareByCallingWorker");
    await this.cipher.key(this.password, "");
    // console.debug("finish getting key");

    const res: Promise<void>[] = [];
    for (let i = 0; i < this.workers.length; ++i) {
      res.push(
        new Promise((resolve, reject) => {
          const channel = new MessageChannel();

          channel.port2.onmessage = (event) => {
            // console.debug("main: receiving msg in prepare");
            const { status } = event.data as RecvMsg;
            if (status === "ok") {
              // console.debug("main: receiving init ok in prepare");
              this.init = true;
              resolve(); // return the class object itself
            } else {
              reject("error after prepareByCallingWorker");
            }
          };

          channel.port2.onmessageerror = (event) => {
            // console.debug("main: receiving error in prepare");
            reject(event);
          };

          // console.debug("main: before postMessage in prepare");
          this.workers[i].postMessage(
            {
              action: "prepare",
              dataKeyBuf: this.cipher.dataKey.buffer,
              nameKeyBuf: this.cipher.nameKey.buffer,
              nameTweakBuf: this.cipher.nameTweak.buffer,
            },
            [channel.port1 /* buffer no transfered because we need to copy */]
          );
        })
      );
    }
    await Promise.all(res);
  }

  async encryptNameByCallingWorker(inputName: string): Promise<string> {
    // console.debug("main: start encryptNameByCallingWorker");
    await this.prepareByCallingWorker();
    // console.debug(
    //   "main: really start generate promise in encryptNameByCallingWorker"
    // );
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in encryptNameByCallingWorker");
        const { outputName } = event.data as RecvMsg;
        if (outputName === undefined) {
          reject("unknown outputName after encryptNameByCallingWorker");
        } else {
          resolve(outputName);
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug("main: receiving error in encryptNameByCallingWorker");
        reject(event);
      };

      // console.debug("main: before postMessage in encryptNameByCallingWorker");
      this.workers[whichWorker].postMessage(
        {
          action: "encryptName",
          inputName: inputName,
        },
        [channel.port1]
      );
    });
  }

  async decryptNameByCallingWorker(inputName: string): Promise<string> {
    await this.prepareByCallingWorker();
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in decryptNameByCallingWorker");
        const { outputName, status } = event.data as RecvMsg;

        if (status === "error") {
          reject("error");
        } else {
          if (outputName === undefined) {
            reject("unknown outputName after decryptNameByCallingWorker");
          } else {
            resolve(outputName);
          }
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug("main: receiving error in decryptNameByCallingWorker");
        reject(event);
        channel;
      };

      // console.debug("main: before postMessage in decryptNameByCallingWorker");
      this.workers[whichWorker].postMessage(
        {
          action: "decryptName",
          inputName: inputName,
        },
        [channel.port1]
      );
    });
  }

  async encryptContentByCallingWorker(
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.prepareByCallingWorker();
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in encryptContentByCallingWorker");
        const { outputContent } = event.data as RecvMsg;
        if (outputContent === undefined) {
          reject("unknown outputContent after encryptContentByCallingWorker");
        } else {
          resolve(outputContent);
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug("main: receiving error in encryptContentByCallingWorker");
        reject(event);
      };

      // console.debug(
      //   "main: before postMessage in encryptContentByCallingWorker"
      // );
      this.workers[whichWorker].postMessage(
        {
          action: "encryptContent",
          inputContent: input,
        },
        [
          channel.port1,
          // input // the array buffer might be re-used later, so we CANNOT transform here
        ]
      );
    });
  }

  async decryptContentByCallingWorker(
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.prepareByCallingWorker();
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in decryptContentByCallingWorker");
        const { outputContent, status } = event.data as RecvMsg;

        if (status === "error") {
          reject("error");
        } else {
          if (outputContent === undefined) {
            reject("unknown outputContent after decryptContentByCallingWorker");
          } else {
            resolve(outputContent);
          }
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug(
        //   "main: receiving onmessageerror in decryptContentByCallingWorker"
        // );
        reject(event);
      };

      // console.debug(
      //   "main: before postMessage in decryptContentByCallingWorker"
      // );
      this.workers[whichWorker].postMessage(
        {
          action: "decryptContent",
          inputContent: input,
        },
        // the decrypted result is not used later in worker, so it's save to transfer
        [channel.port1, input]
      );
    });
  }
}
