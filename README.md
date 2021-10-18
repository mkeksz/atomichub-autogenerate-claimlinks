# Генератор claim ссылок для atomichub
***
**Установка пакета**

`npm i atomichub-autogenerate-claimlinks`

**Пример кода**

```javascript
import LinksGenerator from 'atomichub-autogenerate-claimlinks'

async function start() {
    const atomic = new LinksGenerator('<account_name>', '<private_key>') // all params is optional
    atomic.login() // needed if uses wax cloud wallet
    const assetPages = await atomic.getAssetIDs()
    for (const assetIDs of assetPages) {
        await atomic.generateClaimLinks(assetIDs)
    }
}
start()
```
