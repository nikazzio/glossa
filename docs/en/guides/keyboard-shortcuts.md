---
title: Keyboard shortcuts
---

# Keyboard shortcuts

Global shortcuts use `Ctrl` on Windows and Linux. On macOS you can use `Cmd`.
Except for `Ctrl + Enter`, they are not intercepted while focus is in a text
field, select control or editable text area.

| Shortcut | Action | Conditions |
| --- | --- | --- |
| `Ctrl + Enter` | Starts the selected translation action | Segment mode requires a selected segment; also works inside text fields |
| `Ctrl + S` | Saves the project and modified language resources | Requires an existing project; project saving is deferred while processing |
| `Ctrl + E` | Opens export | Requires at least one segment |
| `Ctrl + ,` | Opens pipeline configuration | Outside editable fields |
| `Ctrl + H` | Opens this section of the in-app guide | Outside editable fields |
| `Ctrl + 1` … `Ctrl + 9` | Selects one of the first nine segments | The segment must exist |
| `Esc` | Closes the active dialog or menu | Depends on the open control |

While a project is processing, the save command reports that project saving
is deferred; modified language resources can still be saved. This shortcut
does not name or create a project for an unsaved draft.

## Navigating controls

Use `Tab` to reach controls and `Enter` or `Space` to activate them. Tab bars
support arrow keys, `Home` and `End`. Icon-button tooltips describe their
action and, where relevant, explain why it is unavailable.
