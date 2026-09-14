import { strict as assert } from "assert";
import { extractDisplayNameFromDriveInfo } from "../src/misc";

describe("Onedrive: extractDisplayNameFromDriveInfo", () => {
  it("should prefer lastModifiedBy user display name", () => {
    assert.equal(
      extractDisplayNameFromDriveInfo({
        createdBy: { user: { displayName: "SharePoint App" } },
        lastModifiedBy: {
          user: { email: "someone@example.com", displayName: "Someone" },
        },
      }),
      "Someone"
    );
  });

  it("should fall back to createdBy user display name", () => {
    assert.equal(
      extractDisplayNameFromDriveInfo({
        createdBy: { user: { displayName: "Creator" } },
      }),
      "Creator"
    );
  });

  it("should return undefined when no display name is present", () => {
    assert.equal(extractDisplayNameFromDriveInfo({}), undefined);
    assert.equal(extractDisplayNameFromDriveInfo(null), undefined);
    assert.equal(extractDisplayNameFromDriveInfo(undefined), undefined);
    assert.equal(
      extractDisplayNameFromDriveInfo({
        lastModifiedBy: { user: {} },
        createdBy: {},
      }),
      undefined
    );
  });
});
