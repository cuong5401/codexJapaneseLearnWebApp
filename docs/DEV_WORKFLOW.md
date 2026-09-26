# Local development workflow

## Browser QA profiles

Keep temporary Chrome or Playwright user-data directories outside this project. On Windows, use a folder under `$env:TEMP`, for example:

```powershell
$qaProfile = Join-Path $env:TEMP 'kotoba-visual-qa-profile'
```

Do not pass a profile path under the repository to Chrome or browser automation. The project `.gitignore` and Vite watcher also exclude common accidentally-created profile paths, but these are fallback protections rather than the intended location.
