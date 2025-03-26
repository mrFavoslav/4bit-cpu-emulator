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

    // Inicializace zobrazení
    initializeDisplays() {
        this.updateRegisters();
        this.updateFlags();
        this.updateLEDs();
        this.updateMemoryDisplay();
    }

    // Připojení tlačítek k funkcím
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

    // Načtení programu do paměti
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

    // Načtení programu do paměti
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

    // Překlad instrukce na strojový kód
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

    // Získání kódu registru
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

    // Spuštění programu
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

    // Zastavení programu
    stop() {
        this.running = false;
    }

    // Krokování programu
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

    // Reset CPU
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
    
    // Pomocné metody pro práci s registry
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

    // Vykonání instrukce
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
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // ADD [mem], reg
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
            case 0x03: { // ADD reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a + value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // ADD [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // ADD [mem], #immediate - NOVÝ TYP
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

    // Implementace SUB instrukce
    executeSUB(type) {
        switch (type) {
            case 0x00: { // SUB reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a - b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // SUB reg, [mem]
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
            case 0x02: { // SUB [mem], reg
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
            case 0x03: { // SUB reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a - value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // SUB [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // SUB [mem], #immediate - NOVÝ TYP
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

    // Implementace AND instrukce
    executeAND(type) {
        switch (type) {
            case 0x00: { // AND reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a & b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // AND reg, [mem]
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
            case 0x02: { // AND [mem], reg
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
            case 0x03: { // AND reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a & value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // AND [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // AND [mem], #immediate - NOVÝ TYP
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

    // Implementace OR instrukce
    executeOR(type) {
        switch (type) {
            case 0x00: { // OR reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a | b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // OR reg, [mem]
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
            case 0x02: { // OR [mem], reg
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
            case 0x03: { // OR reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a | value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // OR [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // OR [mem], #immediate - NOVÝ TYP
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

    // Implementace XOR instrukce
    executeXOR(type) {
        switch (type) {
            case 0x00: { // XOR reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a ^ b;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // XOR reg, [mem]
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
            case 0x02: { // XOR [mem], reg
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
            case 0x03: { // XOR reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a ^ value;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // XOR [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // XOR [mem], #immediate - NOVÝ TYP
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

    // Implementace NOT instrukce
    executeNOT(type) {
        switch (type) {
            case 0x00: { // NOT reg
                const destReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = ~a & 0xFF;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // NOT [mem]
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

    // Implementace JMP instrukce
    executeJMP(type) {
        switch (type) {
            case 0x00: { // JMP reg
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
            case 0x01: { // JMP [mem]
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
            case 0x03: { // JMP #immediate
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

    // Implementace JZ instrukce
    executeJZ(type) {
        if (this.registers.F.ZF === 1) {
            switch (type) {
                case 0x00: { // JZ reg
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
                case 0x01: { // JZ [mem]
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
                case 0x03: { // JZ #immediate
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
            // Pokud ZF není nastaven, přeskočíme operand
            if (type === 0x00 || type === 0x01 || type === 0x03) {
                this.registers.PC++;
            }
        }
    }

    // Implementace JC instrukce
    executeJC(type) {
        if (this.registers.F.CF === 1) {
            switch (type) {
                case 0x00: { // JC reg
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
                case 0x01: { // JC [mem]
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
                case 0x03: { // JC #immediate
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
            // Pokud CF není nastaven, přeskočíme operand
            if (type === 0x00 || type === 0x01 || type === 0x03) {
                this.registers.PC++;
            }
        }
    }

    // Implementace SHL instrukce
    executeSHL(type) {
        switch (type) {
            case 0x00: { // SHL reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bitů posunu
                const result = a << count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // SHL reg, [mem]
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const count = this.memory[address] & 0x7; // Max 7 bitů posunu
                    const result = a << count;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // SHL [mem], reg
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bitů posunu
                    const result = a << count;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // SHL reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bitů posunu
                const a = this.getRegisterValue(destReg);
                const result = a << count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // SHL [mem1], [mem2] - NOVÝ TYP
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const count = this.memory[srcAddress] & 0x7; // Max 7 bitů posunu
                    const result = a << count;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // SHL [mem], #immediate - NOVÝ TYP
                const address = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bitů posunu
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

    // Implementace SHR instrukce
    executeSHR(type) {
        switch (type) {
            case 0x00: { // SHR reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bitů posunu
                const result = a >> count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // SHR reg, [mem]
                const destReg = this.memory[this.registers.PC++];
                const address = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.getRegisterValue(destReg);
                    const count = this.memory[address] & 0x7; // Max 7 bitů posunu
                    const result = a >> count;
                    this.setRegisterValue(destReg, result);
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x02: { // SHR [mem], reg
                const address = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                if (address < this.memory.length) {
                    const a = this.memory[address];
                    const count = this.getRegisterValue(srcReg) & 0x7; // Max 7 bitů posunu
                    const result = a >> count;
                    this.memory[address] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: ${address}`);
                }
                break;
            }
            case 0x03: { // SHR reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bitů posunu
                const a = this.getRegisterValue(destReg);
                const result = a >> count;
                this.setRegisterValue(destReg, result);
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // SHR [mem1], [mem2] - NOVÝ TYP
                const destAddress = this.memory[this.registers.PC++];
                const srcAddress = this.memory[this.registers.PC++];
                if (destAddress < this.memory.length && srcAddress < this.memory.length) {
                    const a = this.memory[destAddress];
                    const count = this.memory[srcAddress] & 0x7; // Max 7 bitů posunu
                    const result = a >> count;
                    this.memory[destAddress] = result & 0xFF;
                    this.updateFlagsFromResult(result);
                } else {
                    console.error(`Memory access out of bounds: dest=${destAddress}, src=${srcAddress}`);
                }
                break;
            }
            case 0x06: { // SHR [mem], #immediate - NOVÝ TYP
                const address = this.memory[this.registers.PC++];
                const count = this.memory[this.registers.PC++] & 0x7; // Max 7 bitů posunu
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

    // Implementace CMP instrukce
    executeCMP(type) {
        switch (type) {
            case 0x00: { // CMP reg, reg
                const destReg = this.memory[this.registers.PC++];
                const srcReg = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const b = this.getRegisterValue(srcReg);
                const result = a - b;
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x01: { // CMP reg, [mem]
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
            case 0x02: { // CMP [mem], reg
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
            case 0x03: { // CMP reg, #immediate
                const destReg = this.memory[this.registers.PC++];
                const value = this.memory[this.registers.PC++];
                const a = this.getRegisterValue(destReg);
                const result = a - value;
                this.updateFlagsFromResult(result);
                break;
            }
            case 0x05: { // CMP [mem1], [mem2] - NOVÝ TYP
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
            case 0x06: { // CMP [mem], #immediate - NOVÝ TYP
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

    // Aktualizace flagů na základě výsledku operace
    updateFlagsFromResult(result) {
        const maxValue = this.registers.F.MOP === 1 ? 0xF : 0xFF; // Max hodnota podle MOP módu
        
        // Carry Flag - nastaví se, pokud dojde k přetečení
        this.registers.F.CF = result > maxValue || result < 0 ? 1 : 0;
        
        // Upravíme výsledek podle módu
        const maskedResult = result & maxValue;
        
        // Zero Flag - nastaví se, pokud je výsledek 0
        this.registers.F.ZF = maskedResult === 0 ? 1 : 0;
        
        // Sign Flag - nastaví se, pokud je nejvyšší bit výsledku 1
        this.registers.F.SF = (maskedResult & (this.registers.F.MOP === 1 ? 0x8 : 0x80)) !== 0 ? 1 : 0;
        
        // Overflow Flag - nastaví se při přetečení nebo podtečení
        this.registers.F.OF = (result > maxValue || result < 0) ? 1 : 0;
        
        // Parity Flag - nastaví se, pokud je počet jedničkových bitů sudý
        let bits = maskedResult;
        let parity = 0;
        while (bits > 0) {
            parity ^= (bits & 1);
            bits >>= 1;
        }
        this.registers.F.PF = parity === 0 ? 1 : 0;
    }

    // Aktualizace zobrazení registrů
    updateRegisters() {
        const registersDiv = document.getElementById('registers');
        
        // Vždy zobrazujeme registry jako dvě 4-bitové banky
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

    // Aktualizace zobrazení flagů
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

    // Aktualizace zobrazení LED
    updateLEDs() {
        const ledDisplay = document.getElementById('ledDisplay');
        ledDisplay.innerHTML = '';
        
        // Získání hodnoty z registru AX
        const output = this.getRegisterValue(0x01);
        
        // Vytvoření LED pro každý bit
        for (let i = 7; i >= 0; i--) {
            const led = document.createElement('div');
            led.className = 'led' + ((output & (1 << i)) ? ' on' : '');
            led.title = `Bit ${i}: ${(output & (1 << i)) ? '1' : '0'}`;
            ledDisplay.appendChild(led);
        }
    }

    // Aktualizace zobrazení paměti
    updateMemoryDisplay() {
        const memoryDiv = document.getElementById('memory');
        memoryDiv.innerHTML = '';
        
        // Vytvoření tabulky pro paměť
        const table = document.createElement('table');
        table.className = 'memory-table';
        
        // Vytvoření hlavičky tabulky
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th></th><th>0</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th>';
        table.appendChild(headerRow);
        
        // Vytvoření buněk pro paměť
        for (let row = 0; row < 16; row++) {
            const tr = document.createElement('tr');
            
            // Přidání hlavičky řádku
            const th = document.createElement('th');
            th.textContent = row.toString(16).toUpperCase();
            tr.appendChild(th);
            
            // Přidání buněk s hodnotami
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

    // Aktualizace zobrazení kódu programu
    updateProgramCode(program) {
        const programCodeDiv = document.getElementById('programCode');
        
        // Přidání čísel řádků a zvýraznění syntaxe
        const lines = program.split('\n');
        let formattedCode = '';
        
        lines.forEach((line, index) => {
            const lineNumber = (index + 1).toString().padStart(3, '0');
            
            // Zvýraznění komentářů
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

// Vytvoření instance CPU
const cpu = new CPU();