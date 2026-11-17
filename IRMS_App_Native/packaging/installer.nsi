Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!insertmacro GetParameters
!insertmacro GetOptions

!ifndef APP_VERSION
  !error "APP_VERSION is required"
!endif
!ifndef APP_EXE
  !error "APP_EXE is required"
!endif
!ifndef TAURI_UNINSTALL_KEY
  !define TAURI_UNINSTALL_KEY "IRMS Dashboard"
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
VIProductVersion "1.3.0.12"
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

Var Updating
Var Relaunch

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "IRMS requires 64-bit Windows."
    Abort
  ${EndIf}
  ; The Tauri app's updater starts this installer with `/P /UPDATE /R /ARGS ...`: run it without a
  ; wizard, replace the Tauri app, and open the native app when it is done.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    StrCpy $Updating 1
    SetSilent silent
  ${EndIf}
  ; The native app updating itself (update_ui.rs): silent, restart afterwards, and leave any installed
  ; Tauri app alone (unlike /UPDATE, which replaces it).
  ClearErrors
  ${GetOptions} $R0 "/SELFUPDATE" $R1
  ${IfNot} ${Errors}
    StrCpy $Relaunch 1
    SetSilent silent
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/R" $R1
  ${IfNot} ${Errors}
    StrCpy $Relaunch 1
  ${EndIf}
  ClearErrors
  Call CloseRunningApp
FunctionEnd

; Closes a running native app so its .exe can be replaced: first a normal close request (the app saves
; the current session), waits up to 10 s, then ends it only if it is still running.
Function CloseRunningApp
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq irms_app_native.exe" /NH | find /I "irms_app_native.exe"'
  Pop $R5
  Pop $R6
  StrCmp $R5 "0" 0 close_done
  nsExec::Exec 'taskkill /IM irms_app_native.exe'
  Pop $R5
  StrCpy $R7 0
  close_wait:
    Sleep 500
    nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq irms_app_native.exe" /NH | find /I "irms_app_native.exe"'
    Pop $R5
    Pop $R6
    StrCmp $R5 "0" 0 close_done
    IntOp $R7 $R7 + 1
    IntCmp $R7 20 close_force close_wait close_wait
  close_force:
  nsExec::Exec 'taskkill /F /IM irms_app_native.exe'
  Pop $R5
  Sleep 1000
  close_done:
FunctionEnd

; Removes the Tauri app (not its data: the native app imports that on first launch).
Function RemoveTauriApp
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${TAURI_UNINSTALL_KEY}" "UninstallString"
  ReadRegStr $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${TAURI_UNINSTALL_KEY}" "InstallLocation"
  StrCmp $R2 "" done
  StrCpy $R4 $R3 1
  StrCmp $R4 '"' 0 +3
    StrCpy $R3 $R3 "" 1
    StrCpy $R3 $R3 -1
  ExecWait '$R2 /S _?=$R3'
  Delete "$R3\uninstall.exe"
  RMDir "$R3"
  done:
FunctionEnd

Function .onInstSuccess
  ${If} $Relaunch == 1
    Exec '"$INSTDIR\irms_app_native.exe"'
  ${EndIf}
FunctionEnd

Section "IRMS Native Beta" SEC_MAIN
  SetShellVarContext current
  Call CloseRunningApp
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
  Delete "$SMPROGRAMS\IRMS Native Beta\IRMS Device (Experimental).lnk"
  CreateShortcut "$SMPROGRAMS\IRMS Native Beta\IRMS Native Beta.lnk" "$INSTDIR\irms_app_native.exe"
  CreateShortcut "$SMPROGRAMS\IRMS Native Beta\IRMS Simulator Demo.lnk" "$INSTDIR\irms_app_native.exe" "--simulate"
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
  ${If} $Updating == 1
    Call RemoveTauriApp
  ${EndIf}
SectionEnd

; Same as CloseRunningApp, for the uninstaller (an uninstaller can only call un.* functions).
Function un.CloseRunningApp
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq irms_app_native.exe" /NH | find /I "irms_app_native.exe"'
  Pop $R5
  Pop $R6
  StrCmp $R5 "0" 0 uclose_done
  nsExec::Exec 'taskkill /IM irms_app_native.exe'
  Pop $R5
  StrCpy $R7 0
  uclose_wait:
    Sleep 500
    nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq irms_app_native.exe" /NH | find /I "irms_app_native.exe"'
    Pop $R5
    Pop $R6
    StrCmp $R5 "0" 0 uclose_done
    IntOp $R7 $R7 + 1
    IntCmp $R7 20 uclose_force uclose_wait uclose_wait
  uclose_force:
  nsExec::Exec 'taskkill /F /IM irms_app_native.exe'
  Pop $R5
  Sleep 1000
  uclose_done:
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  Call un.CloseRunningApp
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
  Delete "$SMPROGRAMS\IRMS Native Beta\IRMS Simulator Demo.lnk"
  Delete "$SMPROGRAMS\IRMS Native Beta\Read Me.lnk"
  RMDir "$SMPROGRAMS\IRMS Native Beta"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta"
  DeleteRegKey HKCU "Software\IRMS\NativeBeta"
  ; 保留獨立資料庫，解除安裝不刪除療程紀錄。
SectionEnd
