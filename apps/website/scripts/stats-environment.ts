import { existsSync } from 'node:fs'
import process from 'node:process'

// Nuxt loads this same ignored file. Existing process environment always wins.
if (existsSync('.env'))
  process.loadEnvFile('.env')
