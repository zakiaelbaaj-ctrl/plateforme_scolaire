# --- Script PowerShell pour comparer deux bases PostgreSQL ---

# Paramètres des bases
$pgUser = "postgres"
$localDb = "plateforme_scolaire_db"
$renderDb = "plateforme_scolaire_render"
$hostLocal = "localhost"
$hostRender = "localhost" # ou l'IP de Render si tu veux comparer à distance

# Mot de passe PostgreSQL (tu peux le mettre ici ou l'exporter via $env:PGPASSWORD)
# $env:PGPASSWORD = "ton_mot_de_passe"

# Crée le CSV dans le même dossier que le script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputCsv = Join-Path $scriptDir "table_comparison.csv"

# --- Fonction pour lister toutes les tables publiques d'une base ---
function Get-AllTables {
    param([string]$Database, [string]$DbHost)

    $query = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
    $tables = psql -U $pgUser -d $Database -h $DbHost -t -A -c $query
    return $tables
}

# --- Fonction pour récupérer le nombre de lignes pour chaque table ---
function Get-TableCounts {
    param(
        [string]$Database,
        [string]$DbHost,
        [array]$Tables
    )

    $counts = @()
    foreach ($t in $Tables) {
        $query = "SELECT COUNT(*) FROM public.`"$t`";"
        try {
            $count = psql -U $pgUser -d $Database -h $DbHost -t -A -c $query
            $counts += [PSCustomObject]@{
                Table = $t
                Count = [int]$count
            }
        } catch {
            Write-Warning "Impossible de compter la table $t dans $Database"
            $counts += [PSCustomObject]@{
                Table = $t
                Count = 0
            }
        }
    }
    return $counts
}
# --- Récupération des tables publiques ---
$allTablesLocal = Get-AllTables -Database $localDb -DbHost $hostLocal
$allTablesRender = Get-AllTables -Database $renderDb -DbHost $hostRender

# Prendre l'union des deux listes pour comparaison
$allTables = ($allTablesLocal + $allTablesRender | Sort-Object -Unique)

Write-Host "Tables détectées :" -ForegroundColor Cyan
$allTables | ForEach-Object { Write-Host $_ }

# --- Récupérer les counts ---
Write-Host "`nRécupération des counts..." -ForegroundColor Cyan
$localCounts = Get-TableCounts -Database $localDb -DbHost $hostLocal -Tables $allTables
$renderCounts = Get-TableCounts -Database $renderDb -DbHost $hostRender -Tables $allTables

# --- Comparer et créer CSV ---
$comparison = foreach ($t in $allTables) {
    $local = ($localCounts | Where-Object { $_.Table -eq $t }).Count
    $render = ($renderCounts | Where-Object { $_.Table -eq $t }).Count
    [PSCustomObject]@{
        Table = $t
        LocalCount = $local
        RenderCount = $render
        Difference = $render - $local
    }
}

$comparison | Sort-Object Difference -Descending | Export-Csv -Path $outputCsv -NoTypeInformation -Encoding UTF8
Write-Host "`nComparaison terminée ! CSV créé ici : $outputCsv`n" -ForegroundColor Green

# --- Affichage des différences ---
$diffTables = $comparison | Where-Object { $_.Difference -ne 0 } | Sort-Object Difference -Descending
if ($diffTables.Count -gt 0) {
    Write-Host "Tables avec différences (Render - Local) :" -ForegroundColor Yellow
    foreach ($row in $diffTables) {
        if ($row.Difference -gt 0) {
            Write-Host "$($row.Table): Local=$($row.LocalCount), Render=$($row.RenderCount), Diff=+$($row.Difference)" -ForegroundColor Green
        } elseif ($row.Difference -lt 0) {
            Write-Host "$($row.Table): Local=$($row.LocalCount), Render=$($row.RenderCount), Diff=$($row.Difference)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "Toutes les tables ont le même nombre de lignes." -ForegroundColor Green
}