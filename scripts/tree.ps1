# scripts/tree.ps1
param(
  [int]$Depth = 3
)

$exclude = @('node_modules','dist','.git')

function Show-Tree {
  param($Path, $Prefix = '', $Level = 0)
  if ($Level -gt $Depth) { return }

  Get-ChildItem -LiteralPath $Path -Force | Where-Object {
    foreach ($e in $exclude) {
      if ($_.FullName -match [regex]::Escape("\$e\")) { return $false }
    }
    return $true
  } |
  # Trier : dossiers d'abord (PSIsContainer true), puis par nom
  Sort-Object -Property @{Expression = { -not $_.PSIsContainer }; Ascending = $true}, @{Expression = { $_.Name }; Ascending = $true} |
  ForEach-Object {
    $name = $_.Name
    if ($_.PSIsContainer) {
      Write-Host ("{0}{1}/" -f $Prefix, $name)
      Show-Tree $_.FullName ("{0}  " -f $Prefix) ($Level + 1)
    } else {
      Write-Host ("{0}{1}" -f $Prefix, $name)
    }
  }
}

$root = Get-Location
Write-Host "Project tree for $($root.Path) (depth=$Depth)`n"
Show-Tree $root.Path
