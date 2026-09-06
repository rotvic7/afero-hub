$ErrorActionPreference = 'Stop'

$toolkitRoot = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
    'SKILL.md',
    'agents/openai.yaml',
    'references/biblioteca-de-comandos.md',
    'references/criterios-de-formato.md',
    'references/controle-de-qualidade.md',
    'assets/modelo-de-produto.md',
    'assets/conteudo-do-produto.md',
    'assets/demonstracao/produto-exemplo.md',
    'assets/demonstracao/painel-demonstrativo.html',
    'assets/demonstracao/visual-demonstrativo.css',
    'assets/demonstracao/experiencia-demonstrativa.js'
)

$missingFiles = @(
    $requiredFiles | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $toolkitRoot $_) -PathType Leaf)
    }
)

if ($missingFiles.Count -gt 0) {
    throw "Arquivos ausentes: $($missingFiles -join ', ')"
}

$productionFiles = @(
    Get-Item -LiteralPath (Join-Path $toolkitRoot 'SKILL.md')
    Get-ChildItem -LiteralPath (Join-Path $toolkitRoot 'agents') -Recurse -File
    Get-ChildItem -LiteralPath (Join-Path $toolkitRoot 'references') -Recurse -File
    Get-ChildItem -LiteralPath (Join-Path $toolkitRoot 'assets') -Recurse -File
)

$legacyTerms = @(
    ('entrega' + '24hrs'),
    ('Kit ' + 'Entrega' + '24hrs'),
    ('Pipoca Que Vira ' + 'Dinheiro'),
    ('Hunter' + ' Hub')
)
$legacyHits = @($productionFiles | Select-String -SimpleMatch -Pattern $legacyTerms)

if ($legacyHits.Count -gt 0) {
    $hitPaths = ($legacyHits.Path | Sort-Object -Unique) -join ', '
    throw "Referencias indevidas encontradas: $hitPaths"
}

$skillPath = Join-Path $toolkitRoot 'SKILL.md'
$skillContent = Get-Content -LiteralPath $skillPath -Raw
$frontmatterPattern = '(?s)^---\s*\r?\nname:\s*toolkit-entregaveis\s*\r?\ndescription:\s*Use when .+?\r?\n---'

if ($skillContent -notmatch $frontmatterPattern) {
    throw 'Frontmatter invalido em SKILL.md.'
}

$openAiConfig = Get-Content -LiteralPath (Join-Path $toolkitRoot 'agents/openai.yaml') -Raw
if ($openAiConfig -notmatch '(?m)^\s*display_name:\s*".+"\s*$' -or
    $openAiConfig -notmatch '(?m)^\s*short_description:\s*".{25,64}"\s*$' -or
    $openAiConfig -notmatch '(?m)^\s*default_prompt:\s*"[^\r\n]*\$toolkit-entregaveis[^\r\n]*"\s*$') {
    throw 'agents/openai.yaml nao atende ao contrato de interface.'
}

$markdownFiles = @($productionFiles | Where-Object { $_.Extension -eq '.md' })
foreach ($file in $markdownFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $relativeLinks = [regex]::Matches($content, '\[[^\]]+\]\((?!https?://|#)([^)]+)\)')

    foreach ($link in $relativeLinks) {
        $rawTarget = $link.Groups[1].Value.Split('#')[0]
        if ([string]::IsNullOrWhiteSpace($rawTarget)) {
            continue
        }

        $targetPath = Join-Path $file.DirectoryName $rawTarget
        if (-not (Test-Path -LiteralPath $targetPath)) {
            throw "Link local invalido em $($file.FullName): $rawTarget"
        }
    }
}

Write-Output 'Toolkit valido.'
