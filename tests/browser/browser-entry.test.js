import { describe, expect, test } from "vitest";
import i18n from "../../i18n.json";
import { Chargy, Alfen, OCMF, SAFEXML } from "../../dist/browser/index.js";

const ellipticStub = {
  ec: class {
  }
};

function momentStub() {
  return {};
}

const asn1Stub = {
  define() {
    return {};
  }
};

function base32DecodeStub() {
  return new ArrayBuffer(0);
}

describe("browser package entry", () => {

  test("imports the browser build in Chromium", () => {
    expect(typeof window).toBe("object");
    expect(typeof window.DOMParser).toBe("function");
    expect(typeof Chargy).toBe("function");
    expect(typeof Alfen).toBe("function");
    expect(typeof OCMF).toBe("function");
    expect(typeof SAFEXML).toBe("function");
  });

  test("creates a Chargy instance with browser-resolved dependencies", () => {
    const chargy = new Chargy(
      i18n,
      "en",
      ellipticStub,
      momentStub,
      asn1Stub,
      base32DecodeStub,
      () => ""
    );

    expect(chargy).toBeInstanceOf(Chargy);
    expect(chargy.GetLocalizedMessage("No charge transparency records found!")).toBeTruthy();
  });

});
