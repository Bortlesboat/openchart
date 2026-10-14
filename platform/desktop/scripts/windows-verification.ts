// Purpose: Verify the final Squirrel payload and installer before recording a signed release.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);
const signature = z.strictObject({
  file: z.string().min(1),
  installer: z.boolean(),
  status: z.string(),
  publisher: z.string().nullable(),
  signerThumbprint: z.string().nullable(),
  timestampPublisher: z.string().nullable(),
  timestampThumbprint: z.string().nullable(),
});

/** Public certificate evidence for one final file; paths are relative to the update package. */
export type WindowsSignature = z.infer<typeof signature>;

/**
 * Validates final Authenticode evidence, requiring the application, Squirrel
 * updater and installer. Every native file must be trusted and timestamped;
 * OpenChart's application/installer/updater must identify Longsurf, Inc.
 * Trusted third-party publishers remain accepted without changing their files.
 * Rejects incomplete inventories, unsafe/duplicate paths, wrong publishers and
 * missing timestamps. Performs no I/O and owns no credentials or cleanup.
 * @example const signatures = validateWindowsSignatures(JSON.parse(stdout));
 */
export function validateWindowsSignatures(value: unknown): WindowsSignature[] {
  const files = z.array(signature).min(1).parse(value);
  const names = new Set<string>();
  for (const file of files) {
    const name = file.file.toLowerCase();
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes(":") ||
      name.split("/").some((part) => !part || part === "." || part === "..") ||
      names.has(name)
    )
      throw new Error(`Invalid or duplicate signature path: ${file.file}`);
    names.add(name);
    if (file.status !== "Valid" || !file.publisher || !file.signerThumbprint)
      throw new Error(
        `Invalid Authenticode signature: ${file.file} (${file.status})`,
      );
    if (!file.timestampPublisher || !file.timestampThumbprint)
      throw new Error(`Missing Authenticode timestamp: ${file.file}`);
    const owned =
      file.installer ||
      /^lib\/net45\/(openchart(?:_executionstub)?|squirrel|update)\.exe$/.test(
        name,
      );
    if (owned && file.publisher !== "Longsurf, Inc.")
      throw new Error(`Expected Longsurf, Inc. publisher: ${file.file}`);
  }
  if (files.filter((file) => file.installer).length !== 1)
    throw new Error("Signature inventory must contain one installer");
  if (
    !files.some(
      (file) =>
        !file.installer &&
        file.file.toLowerCase() === "lib/net45/openchart.exe",
    )
  )
    throw new Error(
      "Signed Windows application is missing from the update package",
    );
  if (
    !files.some(
      (file) =>
        !file.installer &&
        /^lib\/net45\/(squirrel|update)\.exe$/i.test(file.file),
    )
  )
    throw new Error(
      "Signed Squirrel updater is missing from the update package",
    );
  return files;
}

// All paths travel through the subprocess environment, never interpolated shell code.
const collectSignatures = `
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($env:OPENCHART_VERIFY_PACKAGE, $env:OPENCHART_VERIFY_DIRECTORY)
$payload = @(Get-ChildItem -LiteralPath $env:OPENCHART_VERIFY_DIRECTORY -Recurse -File | Where-Object { $_.Extension -in '.exe','.dll','.node' })
$installer = Get-Item -LiteralPath $env:OPENCHART_VERIFY_INSTALLER
$records = @(@($payload) + @($installer) | ForEach-Object {
  $file = $_
  $auth = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $isInstaller = $file.FullName -eq $installer.FullName
  $name = if ($isInstaller) { $file.Name } else { $file.FullName.Substring($env:OPENCHART_VERIFY_DIRECTORY.Length + 1).Replace('\\', '/') }
  [PSCustomObject]@{
    file = $name
    installer = $isInstaller
    status = $auth.Status.ToString()
    publisher = if ($auth.SignerCertificate) { $auth.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) } else { $null }
    signerThumbprint = if ($auth.SignerCertificate) { $auth.SignerCertificate.Thumbprint } else { $null }
    timestampPublisher = if ($auth.TimeStamperCertificate) { $auth.TimeStamperCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) } else { $null }
    timestampThumbprint = if ($auth.TimeStamperCertificate) { $auth.TimeStamperCertificate.Thumbprint } else { $null }
  }
})
ConvertTo-Json -InputObject $records -Depth 4 -Compress
`;

/**
 * Extracts and verifies the final Windows update package plus setup installer,
 * returning public certificate evidence for the release inventory. PowerShell
 * checks OS Authenticode trust; optional OPENCHART_WINDOWS_SIGNTOOL names an
 * existing absolute SignTool and additionally verifies every file with
 * /pa /all /v /tw. Native-tool errors/warnings or invalid evidence reject before
 * release checksums are generated. Owns and always removes its temporary
 * extraction directory; package and installer bytes are never modified.
 * Must run on Windows. Contains no Azure or certificate credentials.
 * @example const evidence = await verifyWindowsRelease(packagePath, installerPath);
 */
export async function verifyWindowsRelease(
  packagePath: string,
  installerPath: string,
) {
  if (process.platform !== "win32")
    throw new Error("Authenticode release verification requires Windows");
  const signtool = process.env.OPENCHART_WINDOWS_SIGNTOOL;
  if (signtool && (!isAbsolute(signtool) || !existsSync(signtool)))
    throw new Error(
      "OPENCHART_WINDOWS_SIGNTOOL must name an existing absolute SignTool path",
    );
  const directory = await mkdtemp(join(tmpdir(), "openchart-signatures-"));
  try {
    const { stdout } = await run(
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        collectSignatures,
      ],
      {
        env: {
          ...process.env,
          OPENCHART_VERIFY_PACKAGE: packagePath,
          OPENCHART_VERIFY_DIRECTORY: directory,
          OPENCHART_VERIFY_INSTALLER: installerPath,
        },
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const files = validateWindowsSignatures(JSON.parse(stdout));
    if (
      !files.some(
        (file) => file.installer && file.file === basename(installerPath),
      )
    )
      throw new Error("Signature inventory identifies a different installer");
    if (signtool) {
      for (const file of files) {
        const { stdout, stderr } = await run(
          signtool,
          [
            "verify",
            "/pa",
            "/all",
            "/v",
            "/tw",
            file.installer ? installerPath : join(directory, file.file),
          ],
          { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        );
        console.log(`SignTool verified ${file.file}:\n${stdout.trim()}`);
        if (stderr.trim()) console.log(stderr.trim());
      }
    }
    return {
      verifiedAt: new Date().toISOString(),
      signtoolVerified: Boolean(signtool),
      files,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
