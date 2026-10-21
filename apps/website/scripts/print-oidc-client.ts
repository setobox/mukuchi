import process from 'node:process'
import { productionOidcClient } from '../config/oidc-client.production.ts'
import { readPublicEnvironment } from '../shared/config/environment.ts'
import './stats-environment.ts'

console.log(JSON.stringify(productionOidcClient(readPublicEnvironment(process.env).siteUrl), null, 2))
