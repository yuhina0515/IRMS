Unicode true
!include "MUI2.nsh"
!include "x64.nsh"

!ifndef APP_VERSION
  !error "APP_VERSION is required"
!endif
!ifndef APP_EXE
  !error "APP_EXE is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif

Name "IRMS Native Beta ${APP_VERSION}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\IRMS Native Beta"
InstallDirRegKey HKCU "Software\IRMS\NativeBeta" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "1.3.0.1"
VIAddVersionKey /LANG=1033 "ProductName" "IRMS Native Beta"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "FileDescription" "IRMS Native Beta Installer"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright (c) 2026 IRMS Team"
!define MUI_ICON "..\..\IRMS_App_Tauri\src-tauri\icons\icon.ico"
!define MUI_UNICON "${MUI_ICON}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "README.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "TradChinese"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "IRMS requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd

Section "IRMS Native Beta" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  ClearErrors
  File /oname=irms_app_native.exe "${APP_EXE}"
  IfErrors 0 +3
    MessageBox MB_ICONSTOP "Close IRMS Native Beta before installing."
    Abort
  File /oname=vcruntime140.dll "${VC_RUNTIME}"
  File "README.txt"
  File /oname=LICENSE.txt "..\..\LICENSE"
  File /oname=THIRD-PARTY-NOTICES.txt "${NOTICES_FILE}"
  IfErrors 0 +3
    MessageBox MB_ICONSTOP "Could not install all application files. Close IRMS and retry."
    Abort
  CreateDirectory "$SMPROGRAMS\IRMS Native Beta"
  CreateShortcut "$SMPROGRAMS\IRMS Native Beta\IRMS Native Beta.lnk" "$INSTDIR\irms_app_native.exe"
  CreateShortcut "$SMPROGRAMS\IRMS Native Beta\IRMS Device (Experimental).lnk" "$INSTDIR\irms_app_native.exe" "--real-ble"
  CreateShortcut "$SMPROGRAMS\IRMS Native Beta\Read Me.lnk" "$INSTDIR\README.txt"
  CreateShortcut "$DESKTOP\IRMS Native Beta.lnk" "$INSTDIR\irms_app_native.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\IRMS\NativeBeta" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "DisplayName" "IRMS Native Beta"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "Publisher" "IRMS Team"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "DisplayIcon" "$INSTDIR\irms_app_native.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$INSTDIR\irms_app_native.exe"
  IfFileExists "$INSTDIR\irms_app_native.exe" 0 +3
    MessageBox MB_ICONSTOP "Close IRMS Native Beta before uninstalling."
    Abort
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\vcruntime140.dll"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\IRMS Native Beta.lnk"
  Delete "$SMPROGRAMS\IRMS Native Beta\IRMS Native Beta.lnk"
  Delete "$SMPROGRAMS\IRMS Native Beta\IRMS Device (Experimental).lnk"
  Delete "$SMPROGRAMS\IRMS Native Beta\Read Me.lnk"
  RMDir "$SMPROGRAMS\IRMS Native Beta"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta"
  DeleteRegKey HKCU "Software\IRMS\NativeBeta"
  ; 保留獨立資料庫，解除安裝不刪除療程紀錄。
SectionEnd
