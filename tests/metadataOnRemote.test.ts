import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

import {
  isEqualMetadataOnRemote,
  MetadataOnRemote,
} from "../src/metadataOnRemote";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Metadata operations tests", () => {
  it("should compare objects deeply", async () => {
    const a: MetadataOnRemote = {
      deletions: [
        { key: "xxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
    };
    const b: MetadataOnRemote = {
      deletions: [
        { key: "xxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
    };

    expect(isEqualMetadataOnRemote(a, b));
  });

  it("should find diff", async () => {
    const a: MetadataOnRemote = {
      deletions: [
        { key: "xxxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
    };
    const b: MetadataOnRemote = {
      deletions: [
        { key: "xxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
    };

    expect(!isEqualMetadataOnRemote(a, b));
  });

  it("should treat undefined correctly", async () => {
    const a: MetadataOnRemote | undefined = undefined;
    let b: MetadataOnRemote | undefined = {
      deletions: [
        { key: "xxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
    };

    expect(!isEqualMetadataOnRemote(a, b));

    b = { deletions: [] };
    expect(isEqualMetadataOnRemote(a, b));

    b = { deletions: undefined };
    expect(isEqualMetadataOnRemote(a, b));

    b = undefined;
    expect(isEqualMetadataOnRemote(a, b));
  });

  it("should ignore generated at fields", async () => {
    const a: MetadataOnRemote = {
      deletions: [
        { key: "xxxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
      generatedWhen: 1,
    };
    const b: MetadataOnRemote = {
      deletions: [
        { key: "xxx", actionWhen: 1 },
        { key: "yyy", actionWhen: 2 },
      ],
      generatedWhen: 2,
    };

    expect(isEqualMetadataOnRemote(a, b));
  });
});
