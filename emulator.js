class CPU {
constructor() {
        this.registers = {
            AX: [0, 0], // AH, AL - vždy dvě 4-bitové banky
            BX: [0, 0], // BH, BL
            CX: [0, 0], // CH, CL
            DX: [0, 0], // DH, DL
            EX: [0, 0], // EH, EL
            GX: [0, 0], // GH, GL
            PC: 0,      // Program Counter
            IR: { IH: 0, IL: 0 }, // Instruction Register (IH = opcode, IL = type)
            F: {
                CF: 0, // Carry Flag
                ZF: 0, // Zero Flag
                SF: 0, // Sign Flag
                OF: 0, // Overflow Flag
                PF: 0, // Parity Flag
                IF: 0, // Interrupt Flag
                MOP: 1 // Memory Operation Mode (1 = 4-bit, 0 = 8-bit)
            }
        };
        this.memory = new Uint8Array(256); // 256 bytes of memory
        this.running = false;
        this.labels = new Map(); // Pro ukládání návěští a jejich adres
        this.eventListenersAttached = false; // Flag pro kontrolu, zda už byly listenery připojeny
        this.initializeDisplays();
        this.attachEventListeners();
    }

    /**
     * Initialize all display elements
     * @method
     */
    initializeDisplays() {
        this.updateRegisters();
        this.updateFlags();
        this.updateLEDs();
        this.updateMemoryDisplay();
    }

    /**
     * Attach event listeners to control buttons
     * @method
     */
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

    /**
     * Load program from file into memory
     * @method
     */
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

    /**
     * Parse and load program into memory
     * @param {string} program - Assembly program text
     */
    loadProgramIntoMemory(program) {
        this.labels.clear(); // Vyčistíme předchozí návěští
        let currentAddress = 0;
        
        // První průchod - sběr návěští
        const lines = program.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith(';'));
        
        lines.forEach(line => {
            if (line.includes(':')) {
                const [label] = line.split(':');
                this.labels.set(label.trim(), currentAddress);
                // Pokud je na řádku jen návěští, nepočítáme adresu
                if (line.trim().endsWith(':')) return;
            }
            
            // Spočítáme velikost instrukce
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
        
        // Druhý průchod - skutečné sestavení
        currentAddress = 0;
        lines.forEach(line => {
            if (line.includes(':')) {
                // Pokud je na řádku jen návěští, přeskočíme
                if (line.trim().endsWith(':')) return;
                // Jinak vezmeme část za návěštím
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

    /**
     * Assemble instruction into machine code
     * @param {string} instruction - Assembly instruction
     * @param {boolean} firstPass - Whether this is the first pass
     * @returns {number[]} Machine code bytes
     */
    assemble(instruction, firstPass = false) {
        const opcodes = {
            'NOP': 0x0,
            'HLT': 0x1,
            'INT': 0x2,
            'MOV': 0x10,
            'ADD': 0x11,
            'SUB': 0x12,
            'AND': 0x13,
            'OR':  0x14,
            'XOR': 0x15,
            'NOT': 0x16,
            'JMP': 0x17,
            'JZ':  0x18,
            'JC':  0x19,
            'SHL': 0x1A,
            'SHR': 0x1B,
            'CMP': 0x1C
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
    
        // Pro skoky (JMP, JZ, JC) přidáme podporu návěští
        if (['JMP', 'JZ', 'JC'].includes(parts[0]) && parts.length === 2) {
            const target = parts[1];
            
            // Pokud je to návěští
            if (!target.startsWith('#') && !target.startsWith('[')) {
                if (firstPass) return [opcode, 0x03, 0x00]; // Dummy hodnoty pro první průchod
                
                const address = this.labels.get(target);
                if (address === undefined) {
                    throw new Error(`Unknown label: ${target}`);
                }
                return [opcode, 0x03, address]; // Použijeme immediate mód
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

    /**
     * Get numeric code for register name
     * @param {string} register - Register name
     * @returns {number} Register code
     */
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

    /**
     * Start continuous program execution
     * @method
     */
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
        }, 40);
    }

    /**
     * Stop program execution
     * @method
     */
    stop() {
        this.running = false;
    }

    /**
     * Execute single instruction
     * @method
     */
    step() {
        if (this.registers.PC >= this.memory.length) {
            this.stop();
            console.log("Program reached end of memory");
            return;
        }
        
        // Načtení opcode a typu instrukce
        const opcode = this.memory[this.registers.PC++];
        const type = this.memory[this.registers.PC++];
        
        // Logování pro ladění - přidáme unikátní identifikátor (např. časové razítko)
        console.log(`Executing instruction at ${new Date().toTimeString().split(' ')[0]}.${new Date().getMilliseconds().toString().padStart(3, '0')}: opcode=${opcode.toString(16)}, type=${type.toString(16)}, PC=${this.registers.PC.toString(16)}`);
        
        // Aktualizace Instruction Register
        this.registers.IR.IH = opcode;
        this.registers.IR.IL = type;
        
        // Vykonání instrukce
        this.execute(opcode, type);
        
        // Aktualizace displejů po každé instrukci
        this.updateRegisters();
        this.updateFlags();
        this.updateLEDs();
        this.updateMemoryDisplay();
    }

    /**
     * Reset CPU to initial state
     * @method
     */
    reset() {
        // Resetování registrů
        for (const reg of ['AX', 'BX', 'CX', 'DX', 'EX', 'GX']) {
            this.registers[reg] = [0, 0];
        }
        
        this.registers.PC = 0;
        this.registers.IR = { IH: 0, IL: 0 };
        
        // Resetování flagů
        for (const flag in this.registers.F) {
            this.registers.F[flag] = flag === 'MOP' ? 1 : 0;
        }
        
        // Resetování paměti
        this.memory = new Uint8Array(256);
        
        this.running = false;
        this.initializeDisplays();
    }
    
    /**
     * Get value from register
     * @param {number} registerCode - Register code
     * @returns {number} Register value
     */
    getRegisterValue(registerCode) {
        let register, highLow;
        
        // Kontrola platnosti kódu registru
        if (registerCode < 0x01 || registerCode > 0x12) {
            console.error(`Invalid register code: ${registerCode.toString(16)}`);
            return 0; // Vrátíme výchozí hodnotu 0
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
        } else { // 8-bit mode - stále používáme dvě 4-bitové banky
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
        
        // Kontrola platnosti kódu registru
        if (registerCode < 0x01 || registerCode > 0x12) {
            console.error(`Invalid register code: ${registerCode.toString(16)}`);
            return; // Ukončíme metodu bez nastavení hodnoty
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
        } else { // 8-bit mode - stále používáme dvě 4-bitové banky
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

    /**
     * Execute instruction based on opcode and type
     * @param {number} opcode - Instruction opcode
     * @param {number} type - Instruction type
     */
    execute(opcode, type) {
        try {
            switch (opcode) {
                case 0x0: // NOP
                    break;
                case 0x1: // HLT
                    this.running = false;
                    console.log("Program halted");
                    break;
                case 0x2: // INT
                    this.executeINT(type);
                    break;
                case 0x10: // MOV
                    this.executeMOV(type);
                    break;
                case 0x11: // ADD
                    this.executeADD(type);
                    break;
                case 0x12: // SUB
                    this.executeSUB(type);
                    break;
                case 0x13: // AND
                    this.executeAND(type);
                    break;
                case 0x14: // OR
                    this.executeOR(type);
                    break;
                case 0x15: // XOR
                    this.executeXOR(type);
                    break;
                case 0x16: // NOT
                    this.executeNOT(type);
                    break;
                case 0x17: // JMP
                    this.executeJMP(type);
                    break;
                case 0x18: // JZ
                    this.executeJZ(type);
                    break;
                case 0x19: // JC
                    this.executeJC(type);
                    break;
                case 0x1A: // SHL
                    this.executeSHL(type);
                    break;
                case 0x1B: // SHR
                    this.executeSHR(type);
                    break;
                case 0x1C: // CMP
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

    // Fix for the executeINT method
    executeINT(type) {
        switch (type) {
            case 0x00: { // INT reg
                const intReg = this.memory[this.registers.PC++];
                const intNum = this.getRegisterValue(intReg);
                this.handleInterrupt(intNum);
                break;
            }
            case 0x01: { // INT [mem]
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const intNum = this.memory[address];
                    this.handleInterrupt(intNum);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // INT #immediate
                const intNum = this.memory[this.registers.PC++];
                this.handleInterrupt(intNum);
                break;
            }
            default:
                console.error(`Unknown INT type: ${type}`);
        }
    }

    // Also fix the handleInterrupt method to properly display AX on LEDs
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

    // Implementace MOV instrukce
    executeMOV(type) {
        switch (type) {
            case 0x00: { // MOV reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const value = this.getRegisterValue(srcReg);
                this.setRegisterValue(destReg, value);
                break;
            }
            case 0x01: { // MOV reg, [mem]
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
            case 0x02: { // MOV [mem], reg
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
            case 0x03: { // MOV reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                this.setRegisterValue(destReg, value);
                break;
            }
            case 0x04: { // MOV MOP, #immediate
                const mode = this.memory[this.registers.PC++];
                this.registers.F.MOP = mode === 0 ? 0 : 1;
                console.log(`MOP mode set to ${this.registers.F.MOP === 1 ? '4-bit' : '8-bit'}`);
                break;
            }
            case 0x05: { // MOV [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // MOV [mem], #immediate - NOVÝ TYP
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

    // Implementace ADD instrukce
    executeADD(type) {
        switch (type) {
            case 0x00: { // ADD reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a + b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // ADD reg, [mem]
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const b = this.memory[address];
                    const result = a + b;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: