// Purpose: Reject a trusted substitute publisher or incomplete signed Squirrel release.
import { expect, test } from "vitest";
import {
  validateWindowsSignatures,
  type WindowsSignature,
} from "./windows-verification";

function release(): WindowsSignature[] {
  const evidence = (
    file: string,
    publisher = "Longsurf, Inc.",
  ): WindowsSignature => ({
    file,
    installer: file.endsWith("-setup.exe"),
    status: "Valid",
    publisher,
    signerThumbprint: "1234",
    timestampPublisher: "Microsoft Time-Stamp Service",
    timestampThumbprint: "5678",
  });
  return [
    evidence("lib/net45/OpenChart.exe"),
    evidence("lib/net45/squirrel.exe"),
    evidence("OpenChart-1.2.3-win32-x64-setup.exe"),
    evidence("lib/net45/libEGL.dll", "Google LLC"),
  ];
}

test("accepts trusted third-party signatures without requiring Longsurf to re-sign dependencies", () => {
  const files = release();
  expect(validateWindowsSignatures(files)).toEqual(files);
});

test.each([0, 1, 2])(
  "rejects a valid signature from a substitute publisher on owned file %i",
  (index) => {
    const files = release();
    files[index]!.publisher = "Longsurf, Inc. Other";
    expect(() => validateWindowsSignatures(files)).toThrow(
      "Expected Longsurf, Inc. publisher",
    );
  },
);

test("rejects an untimestamped dependency even when its present-day signature is valid", () => {
  const files = release();
  files[3]!.timestampThumbprint = null;
  expect(() => validateWindowsSignatures(files)).toThrow(
    "Missing Authenticode timestamp",
  );
});

test.each([0, 1, 2])(
  "rejects an inventory missing required Squirrel release component %i",
  (index) => {
    const files = release();
    files.splice(index, 1);
    expect(() => validateWindowsSignatures(files)).toThrow(
      /missing|one installer/,
    );
  },
);

test("rejects a modified dependency and case-insensitive duplicate inventory entries", () => {
  const files = release();
  files[3]!.status = "HashMismatch";
  expect(() => validateWindowsSignatures(files)).toThrow(
    "Invalid Authenticode signature",
  );
  files[3]!.status = "Valid";
  files.push({ ...files[0]!, file: "LIB/NET45/OPENCHART.EXE" });
  expect(() => validateWindowsSignatures(files)).toThrow(
    "duplicate signature path",
  );
});
