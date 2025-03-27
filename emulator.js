class CPU {
    constructor() {
        this.registers = {
            AX: [0, 0], // AH, AL - two 4-bit banks
            BX: [0, 0], // BH, BL - two 4-bit banks
            CX: [0, 0], // CH, CL - two 4-bit banks
            DX: [0, 0], // DH, DL - two 4-bit banks
            EX: [0, 0], // EH, EL - two 4-bit banks
            GX: [0, 0], // GH, GL - two 4-bit banks
            PC: 0,      // Program Counter - stores the address of the next instruction
            IR: { IH: 0, IL: 0 }, // Instruction Register (IH = opcode, IL = type)
            F: {
                CF: 0, // Carry Flag - set when an operation results in a carry or borrow
                ZF: 0, // Zero Flag - set when the result of an operation is zero
                SF: 0, // Sign Flag - set when the result of an operation is negative
                OF: 0, // Overflow Flag - set when an arithmetic operation overflows
                PF: 0, // Parity Flag - set when the number of 1 bits in the result is even
                IF: 0, // Interrupt Flag - enables/disables interrupts
                MOP: 1 // Memory Operation Mode (1 = 4-bit, 0 = 8-bit)
            }
        };
        this.memory = new Uint8Array(256); // 256 bytes of memory
        this.running = false;
        this.labels = new Map(); // For storing labels and their addresses
        this.eventListenersAttached = false; // Flag to check if event listeners are already attached
        this.initializeDisplays();
        this.attachEventListeners();
    }

    // Initialize displays
    initializeDisplays() {
        this.updateRegisters();
        this.updateFlags();
        this.updateLEDs();
        this.updateMemoryDisplay();
    }

    // Attach buttons to functions
    attachEventListeners() {
        if (this.eventListenersAttached) return;
        
        document.getElementById('loadBtn').addEventListener('click', () => this.loadProgram());
        document.getElementById('runBtn').addEventListener('click', () => {
            if (!this.running) {
                this.run();
            }
        });
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        document.getElementById('stepBtn').addEventListener('click', () => this.step());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        
        this.eventListenersAttached = true;
    }

    // Load program into memory
    loadProgram() {
        fetch('./prog.ass')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load program: ' + response.statusText);
                }
                return response.text();
            })
            .then(program => {
                this.loadProgramIntoMemory(program);
                this.updateProgramCode(program);
            })
            .catch(error => {
                console.error('Error loading program:', error);
                alert('Failed to load program. Check the console for details.');
            });
    }

    // Load program into memory
    loadProgramIntoMemory(program) {
        this.labels.clear(); // Clear previous labels
        let currentAddress = 0;
        
        // First pass - collect labels
        const lines = program.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith(';'));
        
        lines.forEach(line => {
            if (line.includes(':')) {
                const [label] = line.split(':');
                this.labels.set(label.trim(), currentAddress);
                // If the line only contains a label, don't count the address
                if (line.trim().endsWith(':')) return;
            }
            
            // Calculate instruction size
            const instruction = line.split(':')[1]?.trim() || line.trim();
            if (instruction) {
                try {
                    const assembled = this.assemble(instruction, true);
                    currentAddress += assembled.length;
                } catch (error) {
                    console.error(`First pass error: ${error.message}`);
                }
            }
        });
        
        // Second pass - actual assembly
        currentAddress = 0;
        lines.forEach(line => {
            if (line.includes(':')) {
                // If the line only contains a label, skip
                if (line.trim().endsWith(':')) return;
                // Otherwise take the part after the label
                line = line.split(':')[1].trim();
            }
            
            if (line) {
                try {
                    const assembled = this.assemble(line);
                    assembled.forEach(byte => {
                        this.memory[currentAddress++] = byte;
                    });
                } catch (error) {
                    console.error(`Error assembling instruction "${line}": ${error.message}`);
                }
            }
        });
    
        this.registers.PC = 0;
        this.updateMemoryDisplay();
    }

    // Translate instruction to machine code
    assemble(instruction, firstPass = false) {
        const opcodes = {
            'NOP': 0x0,  // No operation
            'HLT': 0x1,  // Halt
            'INT': 0x2,  // Interrupt
            'MOV': 0x10, // Move data
            'ADD': 0x11, // Addition
            'SUB': 0x12, // Subtraction
            'AND': 0x13, // Logical AND
            'OR':  0x14, // Logical OR
            'XOR': 0x15, // Logical XOR
            'NOT': 0x16, // Logical NOT
            'JMP': 0x17, // Jump
            'JZ':  0x18, // Jump if zero
            'JC':  0x19, // Jump if carry
            'SHL': 0x1A, // Shift left
            'SHR': 0x1B, // Shift right
            'CMP': 0x1C  // Compare
        };
    
        // Remove any comments
        const commentIndex = instruction.indexOf(';');
        if (commentIndex !== -1) {
            instruction = instruction.substring(0, commentIndex).trim();
        }
    
        // Split instruction into parts
        const parts = instruction.split(/[ ,]+/).filter(part => part);
        if (parts.length === 0) return [];
    
        const opcode = opcodes[parts[0]];
        if (opcode === undefined) {
            throw new Error(`Unknown instruction: ${parts[0]}`);
        }
    
        // Special case for MOV MOP instruction
        if (parts[0] === 'MOV' && parts[1] === 'MOP' && parts.length === 3) {
            if (parts[2].startsWith('#')) {
                const value = parseInt(parts[2].slice(1), 16);
                return [0x10, 0x04, value];
            } else {
                throw new Error(`Invalid operand for MOV MOP: ${parts[2]}`);
            }
        }
    
        // Instructions without operands
        if (parts[0] === 'NOP' || parts[0] === 'HLT') {
            return [opcode, 0x00];
        }
    
        // For jumps (JMP, JZ, JC) add support for labels
        if (['JMP', 'JZ', 'JC'].includes(parts[0]) && parts.length === 2) {
            const target = parts[1];
            
            // If it's a label
            if (!target.startsWith('#') && !target.startsWith('[')) {
                if (firstPass) return [opcode, 0x03, 0x00]; // Dummy values for first pass
                
                const address = this.labels.get(target);
                if (address === undefined) {
                    throw new Error(`Unknown label: ${target}`);
                }
                return [opcode, 0x03, address]; // Use immediate mode
            }
        }
    
        const operands = parts.slice(1);
        let instrType = 0x00;
        let bytes = [opcode];
    
        // Special handling for the INT instruction
        if (parts[0] === 'INT') {
            if (operands.length !== 1) {
                throw new Error(`Invalid number of operands for INT instruction: ${instruction}`);
            }
            if (operands[0].startsWith('#')) {
                instrType = 0x03;
                bytes.push(instrType);
                bytes.push(parseInt(operands[0].slice(1), 16));
            } else if (operands[0].startsWith('[') && operands[0].endsWith(']')) {
                instrType = 0x01;
                bytes.push(instrType);
                const memAddr = parseInt(operands[0].slice(1, -1), 16);
                bytes.push(memAddr & 0xFF);
            } else {
                instrType = 0x00;
                bytes.push(instrType);
                bytes.push(this.getRegisterCode(operands[0]));
            }
            return bytes;
        }
    
        // Instructions with one operand (e.g. NOT, JMP, JZ, JC)
        if (['NOT', 'JMP', 'JZ', 'JC'].includes(parts[0]) && operands.length === 1) {
            if (operands[0].startsWith('#')) {
                instrType = 0x03;
                bytes.push(instrType);
                bytes.push(parseInt(operands[0].slice(1), 16));
            } else if (operands[0].startsWith('[') && operands[0].endsWith(']')) {
                instrType = 0x01;
                bytes.push(instrType);
                const memAddr = parseInt(operands[0].slice(1, -1), 16);
                bytes.push(memAddr & 0xFF);
            } else {
                instrType = 0x00;
                bytes.push(instrType);
                bytes.push(this.getRegisterCode(operands[0]));
            }
            return bytes;
        }
    
        // Instructions with two operands
        if (operands.length === 2) {
            if (operands[0].startsWith('[') && operands[0].endsWith(']')) {
                if (operands[1].startsWith('[') && operands[1].endsWith(']')) {
                    // [Memory], [Memory]
                    instrType = 0x05;
                    bytes.push(instrType);
                    const destAddr = parseInt(operands[0].slice(1, -1), 16);
                    const srcAddr = parseInt(operands[1].slice(1, -1), 16);
                    bytes.push(destAddr & 0xFF);
                    bytes.push(srcAddr & 0xFF);
                } else if (operands[1].startsWith('#')) {
                    // [Memory], #Immediate
                    instrType = 0x06;
                    bytes.push(instrType);
                    const destAddr = parseInt(operands[0].slice(1, -1), 16);
                    bytes.push(destAddr & 0xFF);
                    bytes.push(parseInt(operands[1].slice(1), 16));
                } else {
                    // [Memory], Register
                    instrType = 0x02;
                    bytes.push(instrType);
                    const memAddr = parseInt(operands[0].slice(1, -1), 16);
                    bytes.push(memAddr & 0xFF);
                    bytes.push(this.getRegisterCode(operands[1]));
                }
            } else if (operands[1].startsWith('[') && operands[1].endsWith(']')) {
                // Register, [Memory]
                instrType = 0x01;
                bytes.push(instrType);
                bytes.push(this.getRegisterCode(operands[0]));
                const memAddr = parseInt(operands[1].slice(1, -1), 16);
                bytes.push(memAddr & 0xFF);
            } else if (operands[1].startsWith('#')) {
                // Register, #Immediate
                instrType = 0x03;
                bytes.push(instrType);
                bytes.push(this.getRegisterCode(operands[0]));
                bytes.push(parseInt(operands[1].slice(1), 16));
            } else {
                // Register, Register
                instrType = 0x00;
                bytes.push(instrType);
                bytes.push(this.getRegisterCode(operands[0]));
                bytes.push(this.getRegisterCode(operands[1]));
            }
            return bytes;
        }
    
        throw new Error(`Invalid instruction format: ${instruction}`);
    }

    // Get register code
    getRegisterCode(register) {
        const registers = { 
            'AX': 0x01, 'BX': 0x02, 'CX': 0x03, 'DX': 0x04, 'EX': 0x05, 'GX': 0x06,
            'AH': 0x07, 'AL': 0x08, 'BH': 0x09, 'BL': 0x0A, 'CH': 0x0B, 'CL': 0x0C,
            'DH': 0x0D, 'DL': 0x0E, 'EH': 0x0F, 'EL': 0x10, 'GH': 0x11, 'GL': 0x12
        };
        
        const code = registers[register];
        if (code === undefined) {
            throw new Error(`Unknown register: ${register}`);
        }
        return code;
    }

    // Run program
    run() {
        this.running = true;
        const interval = setInterval(() => {
            if (!this.running) {
                clearInterval(interval);
                return;
            }
            
            if (this.registers.PC < this.memory.length) {
                this.step();
            } else {
                this.stop();
                console.log("Program reached end of memory");
            }
        }, 10);
    }

    // Stop program
    stop() {
        this.running = false;
    }

    // Step through program
    step() {
        if (this.registers.PC >= this.memory.length) {
            this.stop();
            console.log("Program reached end of memory");
            return;
        }
        
        // Load opcode and instruction type
        const opcode = this.memory[this.registers.PC++];
        const type = this.memory[this.registers.PC++];
        
        // Logging for debugging - add unique identifier (e.g. timestamp)
        console.log(`Executing instruction at ${new Date().toTimeString().split(' ')[0]}.${new Date().getMilliseconds().toString().padStart(3, '0')}: opcode=${opcode.toString(16)}, type=${type.toString(16)}, PC=${this.registers.PC.toString(16)}`);
        
        // Update Instruction Register
        this.registers.IR.IH = opcode;
        this.registers.IR.IL = type;
        
        // Execute instruction
        this.execute(opcode, type);
        
        // Update displays after each instruction
        this.updateRegisters();
        this.updateFlags();
        this.updateLEDs();
        this.updateMemoryDisplay();
    }

    // Reset CPU
    reset() {
        // Reset registers
        for (const reg of ['AX', 'BX', 'CX', 'DX', 'EX', 'GX']) {
            this.registers[reg] = [0, 0];
        }
        
        this.registers.PC = 0;
        this.registers.IR = { IH: 0, IL: 0 };
        
        // Reset flags
        for (const flag in this.registers.F) {
            this.registers.F[flag] = flag === 'MOP' ? 1 : 0;
        }
        
        // Reset memory
        this.memory = new Uint8Array(256);
        
        this.running = false;
        this.initializeDisplays();
    }
    
    // Helper methods for working with registers
    getRegisterValue(registerCode) {
        let register, highLow;
        
        // Check register code validity
        if (registerCode < 0x01 || registerCode > 0x12) {
            console.error(`Invalid register code: ${registerCode.toString(16)}`);
            return 0; // Return default value 0
        }
        
        switch (registerCode) {
            case 0x01: register = 'AX'; highLow = null; break;
            case 0x02: register = 'BX'; highLow = null; break;
            case 0x03: register = 'CX'; highLow = null; break;
            case 0x04: register = 'DX'; highLow = null; break;
            case 0x05: register = 'EX'; highLow = null; break;
            case 0x06: register = 'GX'; highLow = null; break;
            case 0x07: register = 'AX'; highLow = 'high'; break;
            case 0x08: register = 'AX'; highLow = 'low'; break;
            case 0x09: register = 'BX'; highLow = 'high'; break;
            case 0x0A: register = 'BX'; highLow = 'low'; break;
            case 0x0B: register = 'CX'; highLow = 'high'; break;
            case 0x0C: register = 'CX'; highLow = 'low'; break;
            case 0x0D: register = 'DX'; highLow = 'high'; break;
            case 0x0E: register = 'DX'; highLow = 'low'; break;
            case 0x0F: register = 'EX'; highLow = 'high'; break;
            case 0x10: register = 'EX'; highLow = 'low'; break;
            case 0x11: register = 'GX'; highLow = 'high'; break;
            case 0x12: register = 'GX'; highLow = 'low'; break;
        }
        
        if (this.registers.F.MOP === 1) { // 4-bit mode
            if (highLow === 'high') {
                return this.registers[register][0] & 0xF;
            } else if (highLow === 'low') {
                return this.registers[register][1] & 0xF;
            } else {
                return ((this.registers[register][0] & 0xF) << 4) | (this.registers[register][1] & 0xF);
            }
        } else { // 8-bit mode - still using two 4-bit banks
            if (highLow === 'high') {
                return this.registers[register][0] & 0xF;
            } else if (highLow === 'low') {
                return this.registers[register][1] & 0xF;
            } else {
                return ((this.registers[register][0] & 0xF) << 4) | (this.registers[register][1] & 0xF);
            }
        }
    }

    setRegisterValue(registerCode, value) {
        let register, highLow;
        
        // Check register code validity
        if (registerCode < 0x01 || registerCode > 0x12) {
            console.error(`Invalid register code: ${registerCode.toString(16)}`);
            return; // End method without setting value
        }
        
        switch (registerCode) {
            case 0x01: register = 'AX'; highLow = null; break;
            case 0x02: register = 'BX'; highLow = null; break;
            case 0x03: register = 'CX'; highLow = null; break;
            case 0x04: register = 'DX'; highLow = null; break;
            case 0x05: register = 'EX'; highLow = null; break;
            case 0x06: register = 'GX'; highLow = null; break;
            case 0x07: register = 'AX'; highLow = 'high'; break;
            case 0x08: register = 'AX'; highLow = 'low'; break;
            case 0x09: register = 'BX'; highLow = 'high'; break;
            case 0x0A: register = 'BX'; highLow = 'low'; break;
            case 0x0B: register = 'CX'; highLow = 'high'; break;
            case 0x0C: register = 'CX'; highLow = 'low'; break;
            case 0x0D: register = 'DX'; highLow = 'high'; break;
            case 0x0E: register = 'DX'; highLow = 'low'; break;
            case 0x0F: register = 'EX'; highLow = 'high'; break;
            case 0x10: register = 'EX'; highLow = 'low'; break;
            case 0x11: register = 'GX'; highLow = 'high'; break;
            case 0x12: register = 'GX'; highLow = 'low'; break;
        }
        
        if (this.registers.F.MOP === 1) { // 4-bit mode
            if (highLow === 'high') {
                this.registers[register][0] = value & 0xF;
            } else if (highLow === 'low') {
                this.registers[register][1] = value & 0xF;
            } else {
                this.registers[register][0] = (value >> 4) & 0xF;
                this.registers[register][1] = value & 0xF;
            }
        } else { // 8-bit mode - still using two 4-bit banks
            if (highLow === 'high') {
                this.registers[register][0] = value & 0xF;
            } else if (highLow === 'low') {
                this.registers[register][1] = value & 0xF;
            } else {
                this.registers[register][0] = (value >> 4) & 0xF;
                this.registers[register][1] = value & 0xF;
            }
        }
    }

    // Execute instruction
    execute(opcode, type) {
        try {
            switch (opcode) {
                case 0x0: // NOP - No Operation
                    break;
                case 0x1: // HLT - Halt
                    this.running = false;
                    console.log("Program halted");
                    break;
                case 0x2: // INT - Interrupt
                    this.executeINT(type);
                    break;
                case 0x10: // MOV - Move data
                    this.executeMOV(type);
                    break;
                case 0x11: // ADD - Addition
                    this.executeADD(type);
                    break;
                case 0x12: // SUB - Subtraction
                    this.executeSUB(type);
                    break;
                case 0x13: // AND - Logical AND
                    this.executeAND(type);
                    break;
                case 0x14: // OR - Logical OR
                    this.executeOR(type);
                    break;
                case 0x15: // XOR - Logical XOR
                    this.executeXOR(type);
                    break;
                case 0x16: // NOT - Logical NOT
                    this.executeNOT(type);
                    break;
                case 0x17: // JMP - Jump
                    this.executeJMP(type);
                    break;
                case 0x18: // JZ - Jump if Zero
                    this.executeJZ(type);
                    break;
                case 0x19: // JC - Jump if Carry
                    this.executeJC(type);
                    break;
                case 0x1A: // SHL - Shift Left
                    this.executeSHL(type);
                    break;
                case 0x1B: // SHR - Shift Right
                    this.executeSHR(type);
                    break;
                case 0x1C: // CMP - Compare
                    this.executeCMP(type);
                    break;
                default:
                    console.error(`Unknown opcode: ${opcode.toString(16)}`);
            }
        } catch (error) {
            console.error(`Error executing instruction ${opcode.toString(16)}: ${error.message}`);
            this.running = false;
        }
    }

    // Execute INT instruction
    executeINT(type) {
        switch (type) {
            case 0x00: { // INT reg - Interrupt using register value
                const intReg = this.memory[this.registers.PC++];
                const intNum = this.getRegisterValue(intReg);
                this.handleInterrupt(intNum);
                break;
            }
            case 0x01: { // INT [mem] - Interrupt using memory value
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const intNum = this.memory[address];
                    this.handleInterrupt(intNum);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // INT #immediate - Interrupt using immediate value
                const intNum = this.memory[this.registers.PC++];
                this.handleInterrupt(intNum);
                break;
            }
            default:
                console.error(`Unknown INT type: ${type}`);
        }
    }

    // Handle interrupt
    handleInterrupt(intNum) {
        console.log(`Handling interrupt: ${intNum}`);
        switch (intNum) {
            case 0: // INT 0 - Display AX value on LEDs
                console.log(`INT 0: AX = ${this.getRegisterValue(0x01).toString(16)}`);
                this.updateLEDs(); // Make sure LEDs are updated
                break;
            case 1: // INT 1 - Output character from AX
                console.log(`INT 1: Char = ${String.fromCharCode(this.getRegisterValue(0x01))}`);
                break;
            default:
                console.error(`Unknown interrupt number: ${intNum}`);
        }
    }

    // Execute MOV instruction
    executeMOV(type) {
        switch (type) {
            case 0x00: { // MOV reg, reg - Move from register to register
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const value = this.getRegisterValue(srcReg);
                this.setRegisterValue(destReg, value);
                break;
            }
            case 0x01: { // MOV reg, [mem] - Move from memory to register
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const value = this.memory[address];
                    this.setRegisterValue(destReg, value);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // MOV [mem], reg - Move from register to memory
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const value = this.getRegisterValue(srcReg);
                    this.memory[address] = value & 0xFF;
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // MOV reg, #immediate - Move immediate value to register
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                this.setRegisterValue(destReg, value);
                break;
            }
            case 0x04: { // MOV MOP, #immediate - Set Memory Operation Mode
                const mode = this.memory[this.registers.PC++];
                this.registers.F.MOP = mode === 0 ? 0 : 1;
                console.log(`MOP mode set to ${this.registers.F.MOP === 1 ? '4-bit' : '8-bit'}`);
                break;
            }
            case 0x05: { // MOV [mem1], [mem2] - Move from memory to memory
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const value = this.memory[srcAddress];
                    this.memory[destAddress] = value;
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // MOV [mem], #immediate - Move immediate value to memory
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    this.memory[address] = value & 0xFF;
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown MOV type: ${type}`);
        }
    }

    // Execute ADD instruction
    executeADD(type) {
        switch (type) {
            case 0x00: { // ADD reg, reg - Add register to register
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a + b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // ADD reg, [mem] - Add memory to register
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a + b;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // ADD [mem], reg - Add register to memory
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const b = this.getRegisterValue(srcReg);
                    const result = a + b;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // ADD reg, #immediate - Add immediate to register
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a + value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // ADD [mem1], [mem2] - Add memory to memory
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const b = this.memory[srcAddress];
                    const result = a + b;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // ADD [mem], #immediate - Add immediate to memory
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a + value;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown ADD type: ${type}`);
        }
    }

    // Execute SUB instruction
    executeSUB(type) {
        switch (type) {
            case 0x00: { // SUB reg, reg - Subtract register from register
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a - b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // SUB reg, [mem] - Subtract memory from register
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a - b;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // SUB [mem], reg - Subtract register from memory
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const b = this.getRegisterValue(srcReg);
                    const result = a - b;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // SUB reg, #immediate - Subtract immediate from register
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a - value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // SUB [mem1], [mem2] - Subtract memory from memory
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const b = this.memory[srcAddress];
                    const result = a - b;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // SUB [mem], #immediate - Subtract immediate from memory
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a - value;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown SUB type: ${type}`);
        }
    }
    
    // Execute AND instruction
    executeAND(type) {
        switch (type) {
            case 0x00: { // AND reg, reg - Perform logical AND between registers
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a & b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // AND reg, [mem] - Perform logical AND between register and memory
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a & b;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // AND [mem], reg - Perform logical AND between memory and register
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const b = this.getRegisterValue(srcReg);
                    const result = a & b;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // AND reg, #immediate - Perform logical AND between register and immediate value
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a & value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // AND [mem1], [mem2] - Perform logical AND between two memory locations
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const b = this.memory[srcAddress];
                    const result = a & b;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // AND [mem], #immediate - Perform logical AND between memory and immediate value
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a & value;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown AND type: ${type}`);
        }
    }

    // Execute OR instruction
    executeOR(type) {
        switch (type) {
            case 0x00: { // OR reg, reg - Perform logical OR between registers
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a | b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // OR reg, [mem] - Perform logical OR between register and memory
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a | b;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // OR [mem], reg - Perform logical OR between memory and register
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const b = this.getRegisterValue(srcReg);
                    const result = a | b;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // OR reg, #immediate - Perform logical OR between register and immediate value
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a | value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // OR [mem1], [mem2] - Perform logical OR between two memory locations
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const b = this.memory[srcAddress];
                    const result = a | b;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // OR [mem], #immediate - Perform logical OR between memory and immediate value
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a | value;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown OR type: ${type}`);
        }
    }

    // Execute XOR instruction
    executeXOR(type) {
        switch (type) {
            case 0x00: { // XOR reg, reg - Perform logical XOR between registers
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a ^ b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // XOR reg, [mem] - Perform logical XOR between register and memory
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a ^ b;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // XOR [mem], reg - Perform logical XOR between memory and register
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const b = this.getRegisterValue(srcReg);
                    const result = a ^ b;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // XOR reg, #immediate - Perform logical XOR between register and immediate value
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a ^ value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // XOR [mem1], [mem2] - Perform logical XOR between two memory locations
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const b = this.memory[srcAddress];
                    const result = a ^ b;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // XOR [mem], #immediate - Perform logical XOR between memory and immediate value
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a ^ value;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown XOR type: ${type}`);
        }
    }

    // Execute NOT instruction
    executeNOT(type) {
        switch (type) {
            case 0x00: { // NOT reg - Perform logical NOT on register
                const destReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = ~a & 0xFF;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // NOT [mem] - Perform logical NOT on memory
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = ~a & 0xFF;
                    this.memory[address] = result;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown NOT type: ${type}`);
        }
    }

    // Execute JMP instruction
    executeJMP(type) {
        switch (type) {
            case 0x00: { // JMP reg - Jump to address in register
                const srcReg = this.memory[this.registers.PC++];
                const address = this.getRegisterValue(srcReg);
                if (address < this.memory.length) {
                    this.registers.PC = address;
                } else {
                    console.error(`Jump to invalid address: ${address}`);
                    this.running = false;
                }
                break;
            }
            case 0x01: { // JMP [mem] - Jump to address in memory
                const addressPtr = this.memory[this.registers.PC++];
                if (addressPtr < this.memory.length) {
                    const address = this.memory[addressPtr];
                    if (address < this.memory.length) {
                        this.registers.PC = address;
                    } else {
                        console.error(`Jump to invalid address: ${address}`);
                        this.running = false;
                    }
                } else {
                    console.error(`Memory access out of bounds: ${addressPtr}`);
                }
                break;
            }
            case 0x03: { // JMP #immediate - Jump to immediate address
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    this.registers.PC = address;
                } else {
                    console.error(`Jump to invalid address: ${address}`);
                    this.running = false;
                }
                break;
            }
            default:
                console.error(`Unknown JMP type: ${type}`);
        }
    }

    // Execute JZ instruction (Jump if Zero)
    executeJZ(type) {
        if (this.registers.F.ZF === 1) {
            switch (type) {
                case 0x00: { // JZ reg - Jump to address in register if zero flag is set
                    const srcReg = this.memory[this.registers.PC++];
                    const address = this.getRegisterValue(srcReg);
                    if (address < this.memory.length) {
                        this.registers.PC = address;
                    } else {
                        console.error(`Jump to invalid address: ${address}`);
                        this.running = false;
                    }
                    break;
                }
                case 0x01: { // JZ [mem] - Jump to address in memory if zero flag is set
                    const addressPtr = this.memory[this.registers.PC++];
                    if (addressPtr < this.memory.length) {
                        const address = this.memory[addressPtr];
                        if (address < this.memory.length) {
                            this.registers.PC = address;
                        } else {
                            console.error(`Jump to invalid address: ${address}`);
                            this.running = false;
                        }
                    } else {
                        console.error(`Memory access out of bounds: ${addressPtr}`);
                    }
                    break;
                }
                case 0x03: { // JZ #immediate - Jump to immediate address if zero flag is set
                    const address = this.memory[this.registers.PC++];
                    if (address < this.memory.length) {
                        this.registers.PC = address;
                    } else {
                        console.error(`Jump to invalid address: ${address}`);
                        this.running = false;
                    }
                    break;
                }
                default:
                    console.error(`Unknown JZ type: ${type}`);
            }
        } else {
            // If ZF is not set, skip the operand
            if (type === 0x00 || type === 0x01 || type === 0x03) {
                this.registers.PC++;
            }
        }
    }

    // Execute JC instruction (Jump if Carry)
    executeJC(type) {
        if (this.registers.F.CF === 1) {
            switch (type) {
                case 0x00: { // JC reg - Jump to address in register if carry flag is set
                    const srcReg = this.memory[this.registers.PC++];
                    const address = this.getRegisterValue(srcReg);
                    if (address < this.memory.length) {
                        this.registers.PC = address;
                    } else {
                        console.error(`Jump to invalid address: ${address}`);
                        this.running = false;
                    }
                    break;
                }
                case 0x01: { // JC [mem] - Jump to address in memory if carry flag is set
                    const addressPtr = this.memory[this.registers.PC++];
                    if (addressPtr < this.memory.length) {
                        const address = this.memory[addressPtr];
                        if (address < this.memory.length) {
                            this.registers.PC = address;
                        } else {
                            console.error(`Jump to invalid address: ${address}`);
                            this.running = false;
                        }
                    } else {
                        console.error(`Memory access out of bounds: ${addressPtr}`);
                    }
                    break;
                }
                case 0x03: { // JC #immediate - Jump to immediate address if carry flag is set
                    const address = this.memory[this.registers.PC++];
                    if (address < this.memory.length) {
                        this.registers.PC = address;
                    } else {
                        console.error(`Jump to invalid address: ${address}`);
                        this.running = false;
                    }
                    break;
                }
                default:
                    console.error(`Unknown JC type: ${type}`);
            }
        } else {
            // If CF is not set, skip the operand
            if (type === 0x00 || type === 0x01 || type === 0x03) {
                this.registers.PC++;
            }
        }
    }

    // Execute SHL instruction (Shift Left)
    executeSHL(type) {
        switch (type) {
            case 0x00: { // SHL reg, reg - Shift register left by count in another register
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bits shift
                const result = a << count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // SHL reg, [mem] - Shift register left by count in memory
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const count = this.memory[address] & 0x7; // Max 7 bits shift
                    const result = a << count;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // SHL [mem], reg - Shift memory left by count in register
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bits shift
                    const result = a << count;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // SHL reg, #immediate - Shift register left by immediate count
                const destReg = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bits shift
                const a = this.getRegisterValue(destReg);
                const result = a << count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // SHL [mem1], [mem2] - Shift memory left by count in another memory location
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const count = this.memory[srcAddress] & 0x7; // Max 7 bits shift
                    const result = a << count;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // SHL [mem], #immediate - Shift memory left by immediate count
                const address = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bits shift
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a << count;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown SHL type: ${type}`);
        }
    }

    // Execute SHR instruction (Shift Right)
    executeSHR(type) {
        switch (type) {
            case 0x00: { // SHR reg, reg - Shift register right by count in another register
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bits shift
                const result = a >> count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // SHR reg, [mem] - Shift register right by count in memory
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const count = this.memory[address] & 0x7; // Max 7 bits shift
                    const result = a >> count;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // SHR [mem], reg - Shift memory right by count in register
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bits shift
                    const result = a >> count;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // SHR reg, #immediate - Shift register right by immediate count
                const destReg = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bits shift
                const a = this.getRegisterValue(destReg);
                const result = a >> count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // SHR [mem1], [mem2] - Shift memory right by count in another memory location
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const count = this.memory[srcAddress] & 0x7; // Max 7 bits shift
                    const result = a >> count;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // SHR [mem], #immediate - Shift memory right by immediate count
                const address = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bits shift
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a >> count;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown SHR type: ${type}`);
        }
    }

    // Execute CMP instruction (Compare)
    executeCMP(type) {
        switch (type) {
            case 0x00: { // CMP reg, reg - Compare register with register
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a - b;
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // CMP reg, [mem] - Compare register with memory
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a - b;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // CMP [mem], reg - Compare memory with register
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const b = this.getRegisterValue(srcReg);
                    const result = a - b;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // CMP reg, #immediate - Compare register with immediate value
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a - value;
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // CMP [mem1], [mem2] - Compare memory with memory
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const b = this.memory[srcAddress];
                    const result = a - b;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // CMP [mem], #immediate - Compare memory with immediate value
                const address = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const result = a - value;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            default:
                console.error(`Unknown CMP type: ${type}`);
        }
    }

    // Update flags based on operation result
    updateFlagsFromResult(result) {
        const maxValue = this.registers.F.MOP === 1 ? 0xF : 0xFF; // Max value based on MOP mode
      
        // Carry Flag - set if overflow occurs
        this.registers.F.CF = result > maxValue || result < 0 ? 1 : 0;
      
        // Adjust result based on mode
        const maskedResult = result & maxValue;
      
        // Zero Flag - set if result is 0
        this.registers.F.ZF = maskedResult === 0 ? 1 : 0;
      
        // Sign Flag - set if highest bit of result is 1
        this.registers.F.SF = (maskedResult & (this.registers.F.MOP === 1 ? 0x8 : 0x80)) !== 0 ? 1 : 0;
      
        // Overflow Flag - set on overflow or underflow
        this.registers.F.OF = (result > maxValue || result < 0) ? 1 : 0;
      
        // Parity Flag - set if number of 1 bits is even
        let bits = maskedResult;
        let parity = 0;
        while (bits > 0) {
            parity ^= (bits & 1);
            bits >>= 1;
        }
        this.registers.F.PF = parity === 0 ? 1 : 0;
    }

    // Update register display
    updateRegisters() {
        const registersDiv = document.getElementById('registers');
      
        // Always display registers as two 4-bit banks
        registersDiv.innerHTML = `
        AX: ${this.registers.AX[0].toString(16)}${this.registers.AX[1].toString(16)} (AH: ${this.registers.AX[0].toString(16)}, AL: ${this.registers.AX[1].toString(16)})<br>
        BX: ${this.registers.BX[0].toString(16)}${this.registers.BX[1].toString(16)} (BH: ${this.registers.BX[0].toString(16)}, BL: ${this.registers.BX[1].toString(16)})<br>
        CX: ${this.registers.CX[0].toString(16)}${this.registers.CX[1].toString(16)} (CH: ${this.registers.CX[0].toString(16)}, CL: ${this.registers.CX[1].toString(16)})<br>
        DX: ${this.registers.DX[0].toString(16)}${this.registers.DX[1].toString(16)} (DH: ${this.registers.DX[0].toString(16)}, DL: ${this.registers.DX[1].toString(16)})<br>
        EX: ${this.registers.EX[0].toString(16)}${this.registers.EX[1].toString(16)} (EH: ${this.registers.EX[0].toString(16)}, EL: ${this.registers.EX[1].toString(16)})<br>
        GX: ${this.registers.GX[0].toString(16)}${this.registers.GX[1].toString(16)} (GH: ${this.registers.GX[0].toString(16)}, GL: ${this.registers.GX[1].toString(16)})<br>
        PC: ${this.registers.PC.toString(16).padStart(2, '0')}<br>
        IR: ${this.registers.IR.IH.toString(16)}${this.registers.IR.IL.toString(16)} (IH: ${this.registers.IR.IH.toString(16)}, IL: ${this.registers.IR.IL.toString(16)})<br>
        `;
    }

    // Update flags display
    updateFlags() {
        const flagsDiv = document.getElementById('flags');
        flagsDiv.innerHTML = `
        CF: ${this.registers.F.CF} (Carry Flag)<br>
        ZF: ${this.registers.F.ZF} (Zero Flag)<br>
        SF: ${this.registers.F.SF} (Sign Flag)<br>
        OF: ${this.registers.F.OF} (Overflow Flag)<br>
        PF: ${this.registers.F.PF} (Parity Flag)<br>
        IF: ${this.registers.F.IF} (Interrupt Flag)<br>
        MOP: ${this.registers.F.MOP === 1 ? '4-bit' : '8-bit'} (Memory Operation Mode)<br>
        `;
    }

    // Update LED display
    updateLEDs() {
        const ledDisplay = document.getElementById('ledDisplay');
        ledDisplay.innerHTML = '';
      
        // Get value from AX register
        const output = this.getRegisterValue(0x01);
      
        // Create LED for each bit
        for (let i = 7; i >= 0; i--) {
            const led = document.createElement('div');
            led.className = 'led' + ((output & (1 << i)) ? ' on' : '');
            led.title = `Bit ${i}: ${(output & (1 << i)) ? '1' : '0'}`;
            ledDisplay.appendChild(led);
        }
    }

    // Update memory display
    updateMemoryDisplay() {
        const memoryDiv = document.getElementById('memory');
        memoryDiv.innerHTML = '';
      
        // Create table for memory
        const table = document.createElement('table');
        table.className = 'memory-table';
      
        // Create table header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th></th><th>0</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th>';
        table.appendChild(headerRow);
      
        // Create cells for memory
        for (let row = 0; row < 16; row++) {
            const tr = document.createElement('tr');
          
            // Add row header
            const th = document.createElement('th');
            th.textContent = row.toString(16).toUpperCase();
            tr.appendChild(th);
          
            // Add cells with values
            for (let col = 0; col < 16; col++) {
                const address = row * 16 + col;
                const td = document.createElement('td');
                td.textContent = this.memory[address].toString(16).padStart(2, '0').toUpperCase();
                td.className = this.registers.PC === address ? 'active' : '';
                td.title = `Address: ${address.toString(16).padStart(2, '0').toUpperCase()}`;
                tr.appendChild(td);
            }
          
            table.appendChild(tr);
        }
      
        memoryDiv.appendChild(table);
    }

    // Update program code display
    updateProgramCode(program) {
        const programCodeDiv = document.getElementById('programCode');
      
        // Add line numbers and syntax highlighting
        const lines = program.split('\n');
        let formattedCode = '';
      
        lines.forEach((line, index) => {
            const lineNumber = (index + 1).toString().padStart(3, '0');
          
            // Highlight comments
            let formattedLine = line;
            const commentIndex = line.indexOf(';');
            if (commentIndex !== -1) {
                const code = line.substring(0, commentIndex);
                const comment = line.substring(commentIndex);
                formattedLine = `${code}<span class="comment">${comment}</span>`;
            }
          
            formattedCode += `<span class="line-number">${lineNumber}:</span> ${formattedLine}\n`;
        });
      
        programCodeDiv.innerHTML = formattedCode;
    }
}

// Create CPU instance
const cpu = new CPU();