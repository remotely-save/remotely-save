import { Cipher as CipherRCloneCryptPack } from "@fyears/rclone-crypt";
import { nanoid } from "nanoid";

const ctx: WorkerGlobalScope = self as any;

const workerNanoID = nanoid();
const cipher = new CipherRCloneCryptPack("base64");

// console.debug(`worker [${workerNanoID}]: cipher created`);

async function encryptNameStr(input: string) {
  const res = await cipher.encryptFileName(input);
  return res;
}

async function decryptNameStr(input: string) {
  return await cipher.decryptFileName(input);
}

async function encryptContentBuf(input: ArrayBuffer) {
  return (await cipher.encryptData(new Uint8Array(input), undefined)).buffer;
}

async function decryptContentBuf(input: ArrayBuffer) {
  return (await cipher.decryptData(new Uint8Array(input))).buffer;
}

ctx.addEventListener("message", async (event: any) => {
  const port: MessagePort = event.ports[0];
  const {
    action,
    dataKeyBuf,
    nameKeyBuf,
    nameTweakBuf,
    inputName,
    inputContent,
  } = event.data as {
    action:
      | "prepare"
      | "encryptContent"
      | "decryptContent"
      | "encryptName"
      | "decryptName";
    dataKeyBuf?: ArrayBuffer;
    nameKeyBuf?: ArrayBuffer;
    nameTweakBuf?: ArrayBuffer;
    inputName?: string;
    inputContent?: ArrayBuffer;
  };

  // console.debug(`worker [${workerNanoID}]: receiving action=${action}`);

  if (action === "prepare") {
    // console.debug(`worker [${workerNanoID}]: prepare: start`);
    try {
      if (
        dataKeyBuf === undefined ||
        nameKeyBuf === undefined ||
        nameTweakBuf === undefined
      ) {
        // console.debug(`worker [${workerNanoID}]: prepare: no buffer??`);
        throw Error(
          `worker [${workerNanoID}]: prepare: internal keys not transferred to worker properly`
        );
      }
      // console.debug(`worker [${workerNanoID}]: prepare: so we update`);
      cipher.updateInternalKey(
        new Uint8Array(dataKeyBuf),
        new Uint8Array(nameKeyBuf),
        new Uint8Array(nameTweakBuf)
      );
      port.postMessage({
        status: "ok",
      });
    } catch (error) {
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "encryptName") {
    try {
      if (inputName === undefined) {
        throw Error(
          `worker [${workerNanoID}]: encryptName: internal inputName not transferred to worker properly`
        );
      }
      const outputName = await encryptNameStr(inputName);
      // console.debug(
      //   `worker [${workerNanoID}]: after encryptNameStr, before postMessage`
      // );
      port.postMessage({
        status: "ok",
        outputName: outputName,
      });
    } catch (error) {
      console.error(`worker [${workerNanoID}]: encryptName=${inputName}`);
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "decryptName") {
    try {
      if (inputName === undefined) {
        throw Error(
          `worker [${workerNanoID}]: decryptName: internal inputName not transferred to worker properly`
        );
      }
      const outputName = await decryptNameStr(inputName);
      // console.debug(
      //   `worker [${workerNanoID}]: after decryptNameStr, before postMessage`
      // );
      port.postMessage({
        status: "ok",
        outputName: outputName,
      });
    } catch (error) {
      console.error(`worker [${workerNanoID}]: decryptName=${inputName}`);
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "encryptContent") {
    try {
      if (inputContent === undefined) {
        throw Error(
          `worker [${workerNanoID}]: encryptContent: internal inputContent not transferred to worker properly`
        );
      }
      const outputContent = await encryptContentBuf(inputContent);
      // console.debug(
      //   `worker [${workerNanoID}]: after encryptContentBuf, before postMessage`
      // );
      port.postMessage(
        {
          status: "ok",
          outputContent: outputContent,
        },
        [outputContent]
      );
    } catch (error) {
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else if (action === "decryptContent") {
    try {
      if (inputContent === undefined) {
        throw Error(
          `worker [${workerNanoID}]: decryptContent: internal inputContent not transferred to worker properly`
        );
      }
      const outputContent = await decryptContentBuf(inputContent);
      // console.debug(
      //   `worker [${workerNanoID}]: after decryptContentBuf, before postMessage`
      // );
      port.postMessage(
        {
          status: "ok",
          outputContent: outputContent,
        },
        [outputContent]
      );
    } catch (error) {
      console.error(error);
      port.postMessage({
        status: "error",
        error: error,
      });
    }
  } else {
    port.postMessage({
      status: "error",
      error: `worker [${workerNanoID}]: unknown action=${action}`,
    });
  }
});
