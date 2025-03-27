# 4-bit CPU Emulator

A web-based emulator for a simple 4-bit/8-bit CPU architecture. The emulator provides a visual interface for executing assembly programs and observing CPU state.

## Features

- 4-bit/8-bit operation modes (switchable via MOP flag)
- 6 general-purpose registers (AX, BX, CX, DX, EX, GX)
- 256 bytes of memory
- Visual display of registers, flags, and memory state
- LED output display
- Step-by-step execution and continuous running modes

## Instruction Set

The CPU supports the following instructions:
- `NOP` - No operation
- `HLT` - Halt program execution
- `INT` - Interrupt (0 = LED display, 1 = character output)
- `MOV` - Move data between registers/memory
- `ADD` - Addition
- `SUB` - Subtraction
- `AND` - Logical AND
- `OR` - Logical OR
- `XOR` - Logical XOR
- `NOT` - Logical NOT
- `JMP` - Unconditional jump
- `JZ` - Jump if zero
- `JC` - Jump if carry
- `SHL` - Shift left
- `SHR` - Shift right
- `CMP` - Compare

## Usage

1. Open `cpu.html` in a web browser
2. Click "Load Program" to load the assembly program from `prog.ass`
3. Use the control buttons to:
   - Run: Execute the program continuously
   - Stop: Pause execution
   - Step: Execute one instruction
   - Reset: Reset CPU state

## Example Program

The included `prog.ass` file contains a program that finds and displays prime numbers up to 255.