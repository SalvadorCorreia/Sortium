# Sortium Commit Guidelines

Sortium follows the Conventional Commits specification. A clean Git history makes debugging easier and helps automation. If your commit message does not follow this format, it will be rejected.

## The Format

Every commit must use the following structure:

```text
<type>(<scope>): <subject>

<body (optional, but highly recommended)>

<footer (optional, used for closing issues)>

```

## Allowed Types

* `feat`: A new feature or logic module.


* `fix`: A bug fix.


* `docs`: Changes to documentation (like this file) or code comments.


* `refactor`: Code changes that neither fix a bug nor add a feature.


* `test`: Adding missing tests or correcting existing ones.


* `ci`: Changes to our CI configuration files and scripts.


* `chore`: Minor repository maintenance, dependency updates, or `.gitignore` changes.



## Allowed Scopes

The scope should reflect the area changed in this project:

* `frontend`: TypeScript/React code interacting with the Steam UI.
* `backend`: Lua scripts running in the Millennium backend container.
* `infra`: Repository configuration, docs, tooling, and `.gitignore` files.

## Issue Tracking

If your commit addresses a GitHub issue, you must include it in the footer.

* If it partially completes an issue: `Progresses #2`

* If it finishes an issue: `Closes #2`


## Example of a Perfect Commit

```text
feat(frontend): inject custom sorting label into library dropdown

- Locate the Steam UI sort dropdown container.
- Append a new 'Sortium: Median Time' element to the DOM node.
- Attach an empty click event listener for future sorting logic.

Closes #3

```
