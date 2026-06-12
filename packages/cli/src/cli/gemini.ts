import process from 'node:process'
import { runExternalProductCLI } from '../products/cli'

runExternalProductCLI('gemini').catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
