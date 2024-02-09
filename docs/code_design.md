English | [中文](/docs/code_design.zh-cn.md)

# Code Design

## Code Organization

1. Every function except `main.ts` should be pure. Pass any stateful information in parameters.

2. `misc.ts` should not depend on any other written code.

3. Each storage code should not depend on `sync.ts`.

## File and Folder Representation

While writing sync codes, folders are always represented by a string ending with `/`.
