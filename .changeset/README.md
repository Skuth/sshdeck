# Changesets

Todo PR que muda comportamento, corrige bug ou mexe em build/config precisa de um
arquivo novo nesta pasta. Ele vira as linhas do `CHANGELOG.md` e das notas da
release quando a pipeline roda — o `CHANGELOG.md` **não é editado à mão**.

Formato: um `.md` com nome livre (ex.: `pm2-live-detail.md`), uma linha por
mudança, **em inglês**, com o mesmo prefixo dos commits:

```md
Feat: live per-process PM2 detail in Monitor
Fix: send exit before closing the SSH channel
```

Prefixos aceitos: `Feat:`, `Fix:`, `Chore:`, `Refact:`. Linhas começando com `#`
são ignoradas. O bump de versão (`patch`/`minor`/`major`) continua sendo escolhido
ao disparar o workflow **Release**; os arquivos são consumidos (apagados) nesse
momento. Sem nenhum changeset, a pipeline cai no fallback de listar os commits.
