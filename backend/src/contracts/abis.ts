export const UsageMeterABI = [
  "function createSession(address provider, uint256 pricePerAction, string metadataURI) external returns (uint256 sessionId)",
  "function recordAction(uint256 sessionId, uint8 actionType, uint256 units, bytes32 actionHash) external returns (uint256 actionIndex)",
  "function finalizeSession(uint256 sessionId) external",
  "function cancelSession(uint256 sessionId) external",
  "function getSession(uint256 sessionId) view returns (tuple(uint256 id, address consumer, address provider, uint256 pricePerAction, uint256 totalActions, uint256 totalAmount, uint256 createdAt, uint8 status, string metadataURI))",
  "function getSessionAction(uint256 sessionId, uint256 actionIndex) view returns (tuple(uint256 sessionId, uint8 actionType, uint256 units, uint256 cost, bytes32 actionHash, uint256 timestamp))",
  "function getSessionActionCount(uint256 sessionId) view returns (uint256)",
  "function getSessionTotals(uint256 sessionId) view returns (uint256 totalActions, uint256 totalAmount)",
  "function nextSessionId() view returns (uint256)",
  "event SessionCreated(uint256 indexed sessionId, address indexed consumer, address indexed provider, uint256 pricePerAction)",
  "event ActionRecorded(uint256 indexed sessionId, uint256 indexed actionIndex, uint8 actionType, uint256 units, uint256 cost, bytes32 actionHash)",
  "event SessionFinalized(uint256 indexed sessionId, uint256 totalActions, uint256 totalAmount)",
  "event SessionCancelled(uint256 indexed sessionId)",
] as const;

export const NanoSettlementABI = [
  "function depositSession(uint256 sessionId, uint256 amount) external",
  "function settleAction(uint256 sessionId, uint256 actionIndex) external",
  "function settleBatch(uint256 sessionId, uint256 count) external",
  "function withdrawUnused(uint256 sessionId) external",
  "function getDeposit(uint256 sessionId) view returns (uint256 deposited, uint256 spent, uint256 remaining)",
  "function getTotalPaid(uint256 sessionId) view returns (uint256)",
  "function getSettledActionCount(uint256 sessionId) view returns (uint256)",
  "event SessionFunded(uint256 indexed sessionId, address indexed consumer, uint256 amount)",
  "event ActionSettled(uint256 indexed sessionId, uint256 indexed actionIndex, address indexed provider, uint256 amount, uint256 totalPaidSoFar)",
  "event UnusedWithdrawn(uint256 indexed sessionId, address indexed consumer, uint256 amount)",
] as const;

export const AgentRegistryABI = [
  "function registerAgent(string name, string endpointURI, uint256 defaultPricePerAction) external",
  "function updateAgent(string name, string endpointURI, uint256 defaultPricePerAction) external",
  "function deactivateAgent() external",
  "function getAgent(address agentOwner) view returns (tuple(address owner, string name, string endpointURI, uint256 defaultPricePerAction, bool active))",
  "function getAgentByIndex(uint256 index) view returns (tuple(address owner, string name, string endpointURI, uint256 defaultPricePerAction, bool active))",
  "function agentCount() view returns (uint256)",
  "event AgentRegistered(address indexed owner, string name, uint256 defaultPrice)",
  "event AgentUpdated(address indexed owner, string name)",
  "event AgentDeactivated(address indexed owner)",
] as const;

export const ERC20ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function mint(address to, uint256 amount) external",
] as const;
