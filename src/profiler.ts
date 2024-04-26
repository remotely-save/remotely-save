import { SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import { InternalDBs, insertProfilerResultByVault } from "./localdb";
import { unixTimeToStr } from "./misc";

interface BreakPoint {
  label: string;
  fakeTimeMilli: number; // it's NOT a unix timestamp
  indent: number;
}

export class Profiler {
  startTime: number;
  breakPoints: BreakPoint[];
  indent: number;
  constructor(label?: string) {
    this.breakPoints = [];
    this.indent = 0;
    this.startTime = 0;

    if (label !== undefined) {
      this.startTime = Date.now();
      this.breakPoints.push({
        label: label,
        fakeTimeMilli: performance.now(),
        indent: this.indent,
      });
    }
  }

  insert(label: string) {
    if (this.breakPoints.length === 0) {
      this.startTime = Date.now();
    }
    this.breakPoints.push({
      label: label,
      fakeTimeMilli: performance.now(),
      indent: this.indent,
    });

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

  toString() {
    if (this.breakPoints.length === 0) {
      return "nothing in profiler";
    }

    let res = `[startTime]: ${unixTimeToStr(this.startTime)}`;
    for (let i = 0; i < this.breakPoints.length; ++i) {
      if (i === 0) {
        res += `\n[${this.breakPoints[i]["label"]}]: start`;
      } else {
        const label = this.breakPoints[i]["label"];
        const indent = this.breakPoints[i]["indent"];
        const millsec =
          Math.round(
            (this.breakPoints[i]["fakeTimeMilli"] -
              this.breakPoints[i - 1]["fakeTimeMilli"]) *
              10
          ) / 10.0;
        res += `\n${" ".repeat(indent)}[${label}]: ${millsec}ms`;
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
