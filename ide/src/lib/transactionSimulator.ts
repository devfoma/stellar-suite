import { SorobanRpc, Transaction, TransactionBuilder, Contract, xdr } from '@stellar/stellar-sdk';

export interface SimulationResult {
  success: boolean;
  cost?: {
    cpuInsns: string;
    memBytes: string;
    readBytes?: string;
    writeBytes?: string;
    readLedgerEntries?: string;
    writeLedgerEntries?: string;
  };
  auth?: string[];
  minFee?: number;
  error?: string;
  events?: any[];
  result?: any;
}

export interface TransactionBuildOptions {
  contractId: string;
  functionName: string;
  args: any[];
  sourceAccount: string;
  networkPassphrase: string;
  rpcUrl: string;
}

/**
 * Service for simulating Soroban transactions before sending
 * Calls soroban_simulateTransaction RPC endpoint to:
 * - Calculate resource fees (CPU, memory)
 * - Retrieve auth requirements
 * - Get storage changes
 * - Validate transaction execution
 */
export class TransactionSimulator {
  private server: SorobanRpc.Server;

  constructor(rpcUrl: string) {
    this.server = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
  }

  /**
   * Simulate a transaction on the network
   * @param transaction - The unsigned transaction to simulate
   * @returns Simulation result with resources, auth requirements, and any errors
   */
  async simulateTransaction(transaction: Transaction): Promise<SimulationResult> {
    try {
      const response = await this.server.simulateTransaction(transaction);

      if (response.error) {
        return {
          success: false,
          error: response.error,
        };
      }

      return {
        success: true,
        cost: response.cost,
        auth: response.auth?.map(auth => auth.toXDR('base64')),
        minFee: response.minResourceFee,
        events: response.events,
        result: response.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown simulation error',
      };
    }
  }
}

/**
 * Service for building Soroban transactions
 * Handles:
 * - Creating InvokeHostFunction operations from contract + function + args
 * - Applying simulation footprints to transactions
 * - Adding auth entries from simulation
 */
export class TransactionBuilderService {
  /**
   * Build an unsigned transaction for invoking a contract function
   * @param options - Transaction build parameters
   * @returns Unsigned transaction ready for simulation
   */
  static async buildInvokeTransaction(options: TransactionBuildOptions): Promise<Transaction> {
    const { contractId, functionName, args, sourceAccount, networkPassphrase, rpcUrl } = options;

    // Load the source account
    const server = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
    const account = await server.getAccount(sourceAccount);

    // Create contract instance
    const contract = new Contract(contractId);

    // Build the invoke operation
    const invokeOp = contract.call(functionName, ...args);

    // Build transaction
    const transaction = new TransactionBuilder(account, {
      fee: '1000000', // Will be updated by simulation
      networkPassphrase,
    })
      .addOperation(invokeOp)
      .setTimeout(30)
      .build();

    return transaction;
  }

  /**
   * Apply simulation footprint and resource limits to transaction
   * Updates the SorobanTransactionData with exact resource limits from simulation
   * @param transaction - Transaction to update
   * @param simulationResult - Simulation result containing resources
   * @returns Updated transaction with footprint applied
   */
  static applySimulationFootprint(transaction: Transaction, simulationResult: SimulationResult): Transaction {
    if (!simulationResult.success || !simulationResult.cost) {
      throw new Error('Cannot apply footprint: simulation failed or no cost data');
    }

    // Get the current soroban data
    const envelope = transaction.toEnvelope();
    const tx = envelope.v1().tx();
    
    // Update fee
    const fee = simulationResult.minFee || 1000000;
    tx.fee(fee);

    // Create/update soroban data with resources
    let sorobanData = tx.sorobanData();
    if (!sorobanData) {
      // Create new soroban data if it doesn't exist
      sorobanData = xdr.SorobanTransactionData.fromXDR(
        xdr.SorobanTransactionData.fromXDR('', 'base64'),
        'base64'
      );
    }

    // Update the resources with simulation results
    const resources = sorobanData.resources();
    if (simulationResult.cost.cpuInsns) {
      resources.instructions(Number(simulationResult.cost.cpuInsns));
    }
    if (simulationResult.cost.memBytes) {
      resources.memBytes(Number(simulationResult.cost.memBytes));
    }

    tx.sorobanData(sorobanData);

    return new Transaction(envelope, transaction.networkPassphrase);
  }

  /**
   * Apply authorization entries from simulation to transaction
   * @param transaction - Transaction to update
   * @param auth - Authorization entries from simulation (XDR base64 encoded)
   * @returns Updated transaction with auth entries
   */
  static applyAuth(transaction: Transaction, auth: string[]): Transaction {
    const envelope = transaction.toEnvelope();
    const tx = envelope.v1().tx();

    const sorobanData = tx.sorobanData();
    if (sorobanData) {
      const authEntries = auth.map(authXdr => 
        xdr.SorobanAuthorizationEntry.fromXDR(authXdr, 'base64')
      );
      
      // Add auth entries to the footprint
      const footprint = sorobanData.resources().footprint();
      authEntries.forEach(entry => {
        footprint.readWrite().push(entry);
      });
    }

    return new Transaction(envelope, transaction.networkPassphrase);
  }
}