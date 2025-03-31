# 4-bit CPU Emulator

Welcome to the **4-bit CPU Emulator**! This project is a web-based emulator for a simple CPU that supports both 4-bit and 8-bit operations. It allows you to load, execute, and debug programs in a simulated environment with features like registers, flags, memory, and output LEDs.

This emulator is perfect for learning about low-level programming, CPU architecture, and how basic instructions are executed in a processor.

---

## Features

- **4-bit and 8-bit Operation Modes**: Switch between 4-bit and 8-bit modes for different levels of complexity.
- **Registers and Flags**: Simulates CPU registers (AX, BX, CX, etc.) and flags (Zero, Carry, Overflow, etc.).
- **Memory Simulation**: 256 bytes of memory for program storage and execution.
- **Instruction Set**: Supports a variety of instructions, including arithmetic, logical, jump, and bitwise operations.
- **Program Control**: Load, run, step through, and reset programs with intuitive controls.
- **Output LEDs**: Visualize the output of the CPU using LEDs.
- **Interactive Debugging**: View and update registers, flags, and memory in real-time.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Instruction Set](#instruction-set)
5. [File Structure](#file-structure)
6. [Contributing](#contributing)
7. [License](#license)

---

## Getting Started

This emulator runs directly in your browser. You can use it to load and execute programs written in a simple assembly-like language. The interface provides real-time feedback on the state of the CPU, including registers, flags, and memory.

### Prerequisites

To run the emulator, you need:

- A modern web browser (e.g., Chrome, Firefox, Edge).
- Basic knowledge of assembly language and CPU architecture (optional but helpful).

---

## Installation

1. Clone the repository to your local machine:

   ```bash
   git clone https://github.com/mrFavoslav/4bit-cpu-emulator.git
   cd 4bit-cpu-emulator
   ```

2. Open the `cpu.html` file in your browser to start the emulator.

---

## Usage

### Loading a Program

1. Write your program in the `prog.ass` file using the supported instruction set.
2. Click the **Load Program** button in the emulator interface to load the program into memory.

### Running the Emulator

- **Run**: Executes the program continuously until it halts or encounters an error.
- **Step**: Executes the program one instruction at a time, allowing you to debug.
- **Stop**: Halts the execution of the program.
- **Reset**: Resets the CPU, memory, and program state.

### Viewing the State

- **Registers**: Displays the current values of all CPU registers.
- **Flags**: Shows the status of the CPU flags (e.g., Zero, Carry).
- **Memory**: Visualizes the contents of the 256-byte memory.
- **Output LEDs**: Displays the output of the CPU in binary form using LEDs.

---

## Instruction Set

Here’s the complete instruction set for the emulator:

### Instruction Format
Each instruction consists of an opcode and optional operands. The format varies based on the instruction type.

### Registers
- `AX` (AH:AL) - General purpose register
- `BX` (BH:BL) - General purpose register
- `CX` (CH:CL) - General purpose register
- `DX` (DH:DL) - General purpose register
- `MA` (MAH:MAL) #HIDDEN - Memory addressing
- `DT` (DTH:DTL) #HIDDEN - Memory data transfer
- `PC` (PH:PL) - Program Counter
- `IR` (IH:IL) - Instruction Register

### Flags
- `CF` - Carry Flag
- `ZF` - Zero Flag
- `SF` - Sign Flag
- `OF` - Overflow Flag
- `PF` - Parity Flag
- `IF` - Interrupt Flag
- `MOP` - Memory Operation Mode (0 = 8-bit, 1 = 4-bit)

### MOV (Move) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x01 00 | reg, reg | Move between registers | `MOV AX, BX` |
| 0x01 01 | reg, [mem] | Move from memory to register | `MOV AX, [10]` |
| 0x01 02 | [mem], reg | Move from register to memory | `MOV [10], AX` |
| 0x01 03 | reg, #imm | Move immediate to register | `MOV AX, #42` |
| 0x01 05 | [mem1], [mem2] | Move between memory locations | `MOV [10], [20]` |
| 0x01 06 | [mem], #imm | Move immediate to memory | `MOV [10], #42` |

### ADD Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x02 00 | reg, reg | Add registers | `ADD AX, BX` |
| 0x02 01 | reg, [mem] | Add memory to register | `ADD AX, [10]` |
| 0x02 02 | [mem], reg | Add register to memory | `ADD [10], AX` |
| 0x02 03 | reg, #imm | Add immediate to register | `ADD AX, #42` |
| 0x02 05 | [mem1], [mem2] | Add memory locations | `ADD [10], [20]` |
| 0x02 06 | [mem], #imm | Add immediate to memory | `ADD [10], #42` |

### SUB (Subtract) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x03 00 | reg, reg | Subtract registers | `SUB AX, BX` |
| 0x03 01 | reg, [mem] | Subtract memory from register | `SUB AX, [10]` |
| 0x03 02 | [mem], reg | Subtract register from memory | `SUB [10], AX` |
| 0x03 03 | reg, #imm | Subtract immediate from register | `SUB AX, #42` |
| 0x03 05 | [mem1], [mem2] | Subtract memory locations | `SUB [10], [20]` |
| 0x03 06 | [mem], #imm | Subtract immediate from memory | `SUB [10], #42` |

### AND Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x04 00 | reg, reg | AND registers | `AND AX, BX` |
| 0x04 01 | reg, [mem] | AND memory with register | `AND AX, [10]` |
| 0x04 02 | [mem], reg | AND register with memory | `AND [10], AX` |
| 0x04 03 | reg, #imm | AND immediate with register | `AND AX, #42` |
| 0x04 05 | [mem1], [mem2] | AND memory locations | `AND [10], [20]` |
| 0x04 06 | [mem], #imm | AND immediate with memory | `AND [10], #42` |

### OR Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x05 00 | reg, reg | OR registers | `OR AX, BX` |
| 0x05 01 | reg, [mem] | OR memory with register | `OR AX, [10]` |
| 0x05 02 | [mem], reg | OR register with memory | `OR [10], AX` |
| 0x05 03 | reg, #imm | OR immediate with register | `OR AX, #42` |
| 0x05 05 | [mem1], [mem2] | OR memory locations | `OR [10], [20]` |
| 0x05 06 | [mem], #imm | OR immediate with memory | `OR [10], #42` |

### XOR Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x06 00 | reg, reg | XOR registers | `XOR AX, BX` |
| 0x06 01 | reg, [mem] | XOR memory with register | `XOR AX, [10]` |
| 0x06 02 | [mem], reg | XOR register with memory | `XOR [10], AX` |
| 0x06 03 | reg, #imm | XOR immediate with register | `XOR AX, #42` |
| 0x06 05 | [mem1], [mem2] | XOR memory locations | `XOR [10], [20]` |
| 0x06 06 | [mem], #imm | XOR immediate with memory | `XOR [10], #42` |

### NOT Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x07 00 | reg | NOT register | `NOT AX` |
| 0x07 01 | [mem] | NOT memory | `NOT [10]` |

### Jump Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x08 00 | reg | Jump to register address | `JMP AX` |
| 0x08 01 | [mem] | Jump to memory address | `JMP [10]` |
| 0x08 03 | #imm | Jump to immediate address | `JMP #42` |

### JZ (Jump if Zero) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x09 00 | reg | Jump if zero to register address | `JZ AX` |
| 0x09 01 | [mem] | Jump if zero to memory address | `JZ [10]` |
| 0x09 03 | #imm | Jump if zero to immediate address | `JZ #42` |

### JC (Jump if Carry) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x0A 00 | reg | Jump if carry to register address | `JC AX` |
| 0x0A 01 | [mem] | Jump if carry to memory address | `JC [10]` |
| 0x0A 03 | #imm | Jump if carry to immediate address | `JC #42` |

### SHL (Shift Left) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x0B 00 | reg, reg | Shift left register by register count | `SHL AX, BX` |
| 0x0B 01 | reg, [mem] | Shift left register by memory count | `SHL AX, [10]` |
| 0x0B 02 | [mem], reg | Shift left memory by register count | `SHL [10], AX` |
| 0x0B 03 | reg, #imm | Shift left register by immediate count | `SHL AX, #2` |
| 0x0B 05 | [mem1], [mem2] | Shift left memory by memory count | `SHL [10], [20]` |
| 0x0B 06 | [mem], #imm | Shift left memory by immediate count | `SHL [10], #2` |

### SHR (Shift Right) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x0C 00 | reg, reg | Shift right register by register count | `SHR AX, BX` |
| 0x0C 01 | reg, [mem] | Shift right register by memory count | `SHR AX, [10]` |
| 0x0C 02 | [mem], reg | Shift right memory by register count | `SHR [10], AX` |
| 0x0C 03 | reg, #imm | Shift right register by immediate count | `SHR AX, #2` |
| 0x0C 05 | [mem1], [mem2] | Shift right memory by memory count | `SHR [10], [20]` |
| 0x0C 06 | [mem], #imm | Shift right memory by immediate count | `SHR [10], #2` |

### CMP (Compare) Instructions
| Opcode | Type | Description | Example |
|--------|------|-------------|---------|
| 0x0D 00 | reg, reg | Compare registers | `CMP AX, BX` |
| 0x0D 01 | reg, [mem] | Compare register with memory | `CMP AX, [10]` |
| 0x0D 02 | [mem], reg | Compare memory with register | `CMP [10], AX` |
| 0x0D 03 | reg, #imm | Compare register with immediate | `CMP AX, #42` |
| 0x0D 05 | [mem1], [mem2] | Compare memory locations | `CMP [10], [20]` |
| 0x0D 06 | [mem], #imm | Compare memory with immediate | `CMP [10], #42` |

### Special Instructions
| Opcode | Description | Example |
|--------|-------------|---------|
| 0x00 | No Operation (NOP) | `NOP` |
| 0xFF | Halt execution (HLT) | `HLT` |

### Notes
- All memory addresses are 8-bit (0-255)
- Immediate values are 8-bit (0-255)
- Register operations can be 4-bit or 8-bit depending on MOP flag
- All arithmetic and logical operations update the flags automatically

---

## File Structure

```
4bit-cpu-emulator/
├── .gitignore          # Files and directories to ignore in Git
├── LICENSE             # License for the project
├── README.md           # Project documentation
├── cpu.html            # Main HTML file for the emulator interface
├── emulator.js         # JavaScript implementation of the CPU emulator
├── package.json        # Project metadata and dependencies
├── package-lock.json   # Dependency lock file
├── prog.ass            # Example program file (assembly-like language)
```

---

## Contributing

Contributions are welcome! If you'd like to improve the emulator, fix bugs, or add new features, follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Commit your changes and push them to your fork.
4. Submit a pull request with a detailed description of your changes.

---

## License

This project is licensed under the [MIT License](LICENSE). You are free to use, modify, and distribute this project as long as you include the original license.