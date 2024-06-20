import type { Entity } from "./baseTypes";
import { FakeFs } from "./fsAll";

export class FakeFsMock extends FakeFs {
  kind: "mock";

  constructor() {
    super();
    this.kind = "mock";
  }

  async walk(): Promise<Entity[]> {
    throw new Error("Method not implemented.");
  }

  async walkPartial(): Promise<Entity[]> {
    return await this.walk();
  }

  async stat(key: string): Promise<Entity> {
    throw new Error("Method not implemented.");
  }

  async mkdir(key: string, mtime: number, ctime: number): Promise<Entity> {
    throw new Error("Method not implemented.");
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    throw new Error("Method not implemented.");
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async rename(key1: string, key2: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async rm(key: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    return true;
  }

  async getUserDisplayName(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async revokeAuth(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  allowEmptyFile(): boolean {
    throw new Error("Method not implemented.");
  }
}
