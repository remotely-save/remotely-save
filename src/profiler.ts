import type { ProfilerConfig, SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import { type InternalDBs, insertProfilerResultByVault } from "./localdb";
import { roughSizeOfObject, unixTimeToStr } from "./misc";

interface BreakPoint {
  label: string;
  fakeTimeMilli: number; // it's NOT a unix timestamp
  indent: number;
  size?: number;
}

export const DEFAULT_PROFILER_CONFIG: ProfilerConfig = {
  enable: false,
  enablePrinting: false,
  recordSize: false,
};

export class Profiler {
  startTime: number;
  breakPoints: BreakPoint[];
  indent: number;
  enablePrinting: boolean;
  recordSize: boolean;
  constructor(label?: string, enablePrinting?: boolean, recordSize?: boolean) {
    this.breakPoints = [];
    this.indent = 0;
    this.startTime = 0;
    this.enablePrinting = enablePrinting ?? false;
    this.recordSize = recordSize ?? false;

    if (label !== undefined) {
      this.startTime = Date.now();
      const p = {
        label: label,
        fakeTimeMilli: performance.now(),
        indent: this.indent,
      };
      this.breakPoints.push(p);
      if (this.enablePrinting) {
        console.debug(this.toString(-1));
      }
    }
  }

  insert(label: string) {
    if (this.breakPoints.length === 0) {
      this.startTime = Date.now();
    }
    const p = {
      label: label,
      fakeTimeMilli: performance.now(),
      indent: this.indent,
    };
    this.breakPoints.push(p);
    if (this.enablePrinting) {
      console.debug(this.toString(-1));
    }

    return this;
  }

  insertSize(label: string, obj: any) {
    if (!this.recordSize) {
      return;
    }
    if (this.breakPoints.length === 0) {
      this.startTime = Date.now();
    }
    const p = {
      label: label,
      fakeTimeMilli: performance.now(),
      indent: this.indent,
      size: roughSizeOfObject(obj),
    };
    this.breakPoints.push(p);
    if (this.enablePrinting) {
      console.debug(this.toString(-1));
    }

    return this;
  }

  addIndent() {
    this.indent += 2;
  }
  removeIndent() {
    this.indent -= 2;
    if (this.indent < 0) {
      this.indent = 0;
    }
  }

  clear() {
    this.breakPoints = [];
    this.indent = 0;
    this.startTime = 0;
    return this;
  }

  toString(idx?: number) {
    if (idx !== undefined) {
      let i = idx;
      if (idx < 0) {
        i = this.breakPoints.length + idx;
      }
      const label = this.breakPoints?.[i]["label"];
      const indent = this.breakPoints?.[i]["indent"];
      let millsec = 0;
      if (i >= 1) {
        millsec =
          Math.round(
            (this.breakPoints?.[i]["fakeTimeMilli"] -
              this.breakPoints?.[i - 1]["fakeTimeMilli"]) *
              10
          ) / 10.0;
      }
      let res = `${" ".repeat(indent)}[${label}]: ${millsec}ms`;
      if (this.breakPoints[i].hasOwnProperty("size")) {
        const size = this.breakPoints[i].size as number;
        res += `, size=${size}`;
      }
      return res;
    }

    if (this.breakPoints.length === 0) {
      return "nothing in profiler";
    }

    let res = `[startTime]: ${unixTimeToStr(this.startTime)}`;
    for (let i = 0; i < this.breakPoints.length; ++i) {
      if (i === 0) {
        res += `\n[${this.breakPoints[i]["label"]}]: start`;
      } else {
        res += `\n${this.toString(i)}`;
      }
    }

    return res;
  }

  async save(
    db: InternalDBs,
    vaultRandomID: string,
    remoteType: SUPPORTED_SERVICES_TYPE
  ) {
    await insertProfilerResultByVault(
      db,
      this.toString(),
      vaultRandomID,
      remoteType
    );
  }
}
