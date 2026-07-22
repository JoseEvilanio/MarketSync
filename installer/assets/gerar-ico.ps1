Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class IconExtractor {
    [DllImport("shell32.dll", CharSet=CharSet.Auto)]
    public static extern IntPtr ExtractIcon(IntPtr hInst, string lpszExeFileName, int nIconIndex);
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr hIcon);
}
"@ -ReferencedAssemblies "System.Drawing"

$iconPath = Split-Path $MyInvocation.MyCommand.Path
$outFile  = Join-Path $iconPath "logo.ico"

$hIcon = [IconExtractor]::ExtractIcon([IntPtr]::Zero, "C:\Windows\System32\shell32.dll", 44)
if ($hIcon -ne [IntPtr]::Zero) {
    $icon   = [System.Drawing.Icon]::FromHandle($hIcon)
    $stream = [System.IO.File]::OpenWrite($outFile)
    $icon.Save($stream)
    $stream.Close()
    [IconExtractor]::DestroyIcon($hIcon) | Out-Null
    Write-Host "Icone salvo: $outFile ($((Get-Item $outFile).Length) bytes)"
} else {
    Write-Host "ERRO: nao foi possivel extrair o icone"
}
