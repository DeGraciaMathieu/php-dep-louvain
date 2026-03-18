#!/usr/bin/env node
/**
 * CLI entry-point for Louvain community detection on dependency-analysis JSON.
 *
 * Usage:
 *   tsx src/index.ts [options] [input.json]
 *
 * Options:
 *   --internal-only     Only cluster nodes listed in data.classes (skip external/vendor)
 *   --format json|text|html   Output format (default: json)
 *   --out <file>        Write output to a file instead of stdout
 *   --max-levels <n>    Maximum number of Louvain phases (default: 15)
 *   --help              Show this help
 *
 * Input is read from the file argument or stdin if omitted.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { buildGraph }                  from './graph.js'
import { louvain, computeModularity }  from './louvain.js'
import { buildVisData, generateHtml }  from './visualize.js'
import type { InputData }              from './types.js'

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  let inputFile   : string | null           = null
  let outputFile  : string | null           = null
  let internalOnly                          = false
  let format      : 'json' | 'text' | 'html' = 'json'
  let maxLevels                             = 15

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: louvain [--internal-only] [--format json|text|html] [--out file] [--max-levels n] [input.json]',
      )
      process.exit(0)
    } else if (arg === '--max-levels' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10)
      if (isNaN(n) || n < 1) {
        console.error('--max-levels must be a positive integer.')
        process.exit(1)
      }
      maxLevels = n
    } else if (arg === '--internal-only') {
      internalOnly = true
    } else if (arg === '--format' && argv[i + 1]) {
      const f = argv[++i]
      if (f !== 'json' && f !== 'text' && f !== 'html') {
        console.error(`Unknown format: ${f}. Use json, text, or html.`)
        process.exit(1)
      }
      format = f
    } else if (arg === '--out' && argv[i + 1]) {
      outputFile = argv[++i]
    } else if (!arg.startsWith('-')) {
      inputFile = arg
    }
  }
  return { inputFile, outputFile, internalOnly, format, maxLevels }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function commonNamespace(fqcns: string[]): string {
  if (fqcns.length === 0) return ''
  const parts   = fqcns.map(f => f.split('\\'))
  const shortest = Math.min(...parts.map(p => p.length))
  const common: string[] = []
  for (let i = 0; i < shortest - 1; i++) {
    const seg = parts[0][i]
    if (parts.every(p => p[i] === seg)) common.push(seg)
    else break
  }
  return common.join('\\') || '(root)'
}

function communityDensity(
  members: number[],
  adj: { to: number; weight: number }[][],
): number {
  const set = new Set(members)
  const n   = members.length
  if (n < 2) return 0
  let edges = 0
  for (const m of members) {
    for (const { to } of adj[m]) {
      if (to > m && set.has(to)) edges++
    }
  }
  return edges / ((n * (n - 1)) / 2)
}

// ---------------------------------------------------------------------------
// Output builders
// ---------------------------------------------------------------------------

export function toJsonOutputRaw(
  data: InputData,
  labels: string[],
  isInternal: boolean[],
  adj: { to: number; weight: number }[][],
  community: Int32Array,
  modularity: number,
) {
  const nc = 1 + Math.max(...Array.from(community))
  const commNodes: number[][] = Array.from({ length: nc }, () => [])
  for (let i = 0; i < labels.length; i++) commNodes[community[i]].push(i)
  commNodes.sort((a, b) => b.length - a.length)

  const classMap = new Map(data.classes.map(c => [c.fqcn, c]))

  const communities = commNodes.map((members, id) => {
    const internalMembers = members.filter(i => isInternal[i]).map(i => labels[i])
    const externalMembers = members.filter(i => !isInternal[i]).map(i => labels[i])
    return {
      id,
      namespace:        commonNamespace(internalMembers),
      size:             members.length,
      internal_count:   internalMembers.length,
      density:          +communityDensity(members, adj).toFixed(4),
      members:          internalMembers.sort(),
      external_members: externalMembers.sort(),
      types: [...new Set(
        internalMembers
          .map(f => classMap.get(f)?.type)
          .filter((t): t is string => !!t),
      )],
    }
  })

  return {
    meta: {
      analyzed_path:       data.meta.analyzed_path,
      modularity:          +modularity.toFixed(6),
      community_count:     nc,
      node_count:          labels.length,
      internal_node_count: isInternal.filter(Boolean).length,
    },
    communities,
  }
}

function toTextOutput(
  labels: string[],
  isInternal: boolean[],
  community: Int32Array,
  modularity: number,
): string {
  const nc = 1 + Math.max(...Array.from(community))
  const commNodes: number[][] = Array.from({ length: nc }, () => [])
  for (let i = 0; i < labels.length; i++) commNodes[community[i]].push(i)
  commNodes.sort((a, b) => b.length - a.length)

  const lines: string[] = [
    `Modularity : ${modularity.toFixed(4)}`,
    `Communities: ${nc}`,
    '',
  ]

  for (let id = 0; id < commNodes.length; id++) {
    const members  = commNodes[id]
    const internal = members.filter(i => isInternal[i])
    const ns       = commonNamespace(internal.map(i => labels[i]))
    lines.push(`── Community ${id}  (${members.length} nodes, namespace: ${ns})`)
    for (const i of members) {
      lines.push(`   ${labels[i]}${isInternal[i] ? '' : '  [ext]'}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { inputFile, outputFile, internalOnly, format, maxLevels } = parseArgs(process.argv)

  let raw: string
  try {
    raw = inputFile
      ? readFileSync(inputFile, 'utf-8')
      : readFileSync('/dev/stdin', 'utf-8')
  } catch {
    console.error('Error: could not read input. Provide a file path or pipe JSON to stdin.')
    process.exit(1)
  }

  let data: InputData
  try {
    data = JSON.parse(raw)
  } catch (e) {
    console.error('Error: invalid JSON input.', (e as Error).message)
    process.exit(1)
  }

  if (!data.classes || !data.edges) {
    console.error('Error: input must have "classes" and "edges" arrays.')
    process.exit(1)
  }

  const g         = buildGraph(data, internalOnly)
  const community = louvain(g, maxLevels)
  const Q         = computeModularity(g, community)

  let output: string

  if (format === 'text') {
    output = toTextOutput(g.labels, g.isInternal, community, Q)

  } else if (format === 'html') {
    const jsonResult = toJsonOutputRaw(data, g.labels, g.isInternal, g.adj, community, Q)

    // Remap community ids to match the sorted order in jsonResult
    const commIdByLabel = new Map<string, number>()
    for (const comm of jsonResult.communities) {
      for (const m of comm.members)          commIdByLabel.set(m, comm.id)
      for (const m of comm.external_members) commIdByLabel.set(m, comm.id)
    }
    const remappedCommunity = Int32Array.from(
      g.labels, label => commIdByLabel.get(label) ?? 0
    )

    output = generateHtml(buildVisData(jsonResult, g, remappedCommunity))

  } else {
    output = JSON.stringify(
      toJsonOutputRaw(data, g.labels, g.isInternal, g.adj, community, Q),
      null, 2,
    )
  }

  if (outputFile) {
    writeFileSync(outputFile, output, 'utf-8')
    console.error(`Written to ${outputFile}`)
  } else {
    process.stdout.write(output + '\n')
  }
}

main()
