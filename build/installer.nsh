!macro preInit
  ; Seed the default directory only for a first install. electron-builder
  ; reads InstallLocation after preInit and uses it as the upgrade directory;
  ; never overwrite that value or an update would jump back to the default.
  SetRegView 64
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\拾序"
  ${EndIf}
  SetRegView 32
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\拾序"
  ${EndIf}
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
