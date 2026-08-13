' ==========================================================================
'  run-hidden.vbs — launch one of the .bat files with NO console window.
'
'  Task Scheduler runs the tasks as the logged-on user, so cmd.exe pops a
'  black window on screen every time. Wrapping the .bat in this script hides
'  it. The report itself is unchanged; only the window is gone.
'
'  Usage:  wscript.exe "run-hidden.vbs" run-report-scheduled.bat
' ==========================================================================
Dim shell, fso, here, target

If WScript.Arguments.Count < 1 Then
  WScript.Quit 2
End If

Set fso   = CreateObject("Scripting.FileSystemObject")
here      = fso.GetParentFolderName(WScript.ScriptFullName)
target    = fso.BuildPath(here, WScript.Arguments(0))

If Not fso.FileExists(target) Then
  WScript.Quit 3
End If

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = here
' 0 = hidden window, True = wait, so Task Scheduler sees the real exit code
WScript.Quit shell.Run("""" & target & """", 0, True)
