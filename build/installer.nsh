!macro preInit
  ; Keep the default installation directory aligned with the product name.
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\拾序"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\拾序"
!macroend

!macro customInstall
  ; The standard uninstaller remains inside the install directory. Add a
  ; clearly named Start Menu entry so removal is always one click away.
  CreateDirectory "$SMPROGRAMS\拾序"
  CreateShortCut "$SMPROGRAMS\拾序\卸载拾序.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\拾序\卸载拾序.lnk"
  RMDir "$SMPROGRAMS\拾序"
!macroend

