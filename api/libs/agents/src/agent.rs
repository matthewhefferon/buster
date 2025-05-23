use crate::tools::{IntoToolCallExecutor, ToolExecutor};
use anyhow::Result;
use braintrust::{BraintrustClient, TraceBuilder};
use litellm::{
    AgentMessage, ChatCompletionRequest, DeltaToolCall, FunctionCall, LiteLLMClient,
    MessageProgress, Metadata, Tool, ToolCall, ToolChoice,
};
use once_cell::sync::Lazy;
use serde_json::Value;
use std::time::{Duration, Instant};
use std::{collections::HashMap, env, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use tracing::error;
use uuid::Uuid;

// Type definition for tool registry to simplify complex type
// No longer needed, defined below
use crate::models::AgentThread;

// Import Mode related types (adjust path if needed)
use crate::agents::modes::ModeConfiguration;

// Global BraintrustClient instance
static BRAINTRUST_CLIENT: Lazy<Option<Arc<BraintrustClient>>> = Lazy::new(|| {
    match (
        std::env::var("BRAINTRUST_API_KEY"),
        std::env::var("BRAINTRUST_LOGGING_ID"),
    ) {
        (Ok(_), Ok(buster_logging_id)) => match BraintrustClient::new(None, &buster_logging_id) {
            Ok(client) => Some(client),
            Err(e) => {
                eprintln!("Failed to create Braintrust client: {}", e);
                None
            }
        },
        _ => None,
    }
});

#[derive(Debug, Clone)]
pub struct AgentError(pub String);

impl std::error::Error for AgentError {}

impl std::fmt::Display for AgentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

type MessageResult = Result<AgentMessage, AgentError>;

#[derive(Debug)]
struct MessageBuffer {
    content: String,
    tool_calls: HashMap<String, PendingToolCall>,
    last_flush: Instant,
    message_id: Option<String>,
    first_message_sent: bool,
}

impl MessageBuffer {
    fn new() -> Self {
        Self {
            content: String::new(),
            tool_calls: HashMap::new(),
            last_flush: Instant::now(),
            message_id: None,
            first_message_sent: false,
        }
    }

    fn should_flush(&self) -> bool {
        self.last_flush.elapsed() >= Duration::from_millis(50)
    }

    fn has_changes(&self) -> bool {
        !self.content.is_empty() || !self.tool_calls.is_empty()
    }

    async fn flush(&mut self, agent: &Agent) -> Result<()> {
        if !self.has_changes() {
            return Ok(());
        }

        // Create tool calls vector if we have any
        let tool_calls: Option<Vec<ToolCall>> = if !self.tool_calls.is_empty() {
            Some(
                self.tool_calls
                    .values()
                    .filter_map(|p| {
                        if p.function_name.is_some() {
                            Some(p.clone().into_tool_call())
                        } else {
                            None
                        }
                    })
                    .collect(),
            )
        } else {
            None
        };

        // Create and send the message
        let message = AgentMessage::assistant(
            self.message_id.clone(),
            if self.content.is_empty() {
                None
            } else {
                Some(self.content.clone())
            },
            tool_calls,
            MessageProgress::InProgress,
            Some(!self.first_message_sent),
            Some(agent.name.clone()),
        );

        // Continue on error with broadcast::error::SendError
        // Ensure we handle the Result from get_stream_sender first
        if let Ok(sender) = agent.get_stream_sender().await {
            if let Err(e) = sender.send(Ok(message)) {
                // Log warning but don't fail the operation
                tracing::warn!("Channel send error, message may be dropped: {}", e);
            }
        } else {
            tracing::warn!("Stream sender not available, message dropped.");
        }

        // Update state
        self.first_message_sent = true;
        self.last_flush = Instant::now();
        // Do NOT clear content between flushes - we need to accumulate all content
        // only to keep tool calls as they may still be accumulating

        Ok(())
    }
}

// Helper struct to store the tool and its enablement condition
struct RegisteredTool {
    executor: Box<dyn ToolExecutor<Output = Value, Params = Value> + Send + Sync>,
    // Make the condition optional
    enablement_condition: Option<Box<dyn Fn(&HashMap<String, Value>) -> bool + Send + Sync>>,
}

// Update the ToolRegistry type alias is no longer needed, but we need the new type for the map
type ToolsMap = Arc<RwLock<HashMap<String, RegisteredTool>>>;

// --- Define ModeProvider Trait --- 
#[async_trait::async_trait]
pub trait ModeProvider {
    // Fetches the complete configuration for a given agent state
    async fn get_configuration_for_state(&self, state: &HashMap<String, Value>) -> Result<ModeConfiguration>;
}
// --- End ModeProvider Trait --- 

#[derive(Clone)]
/// The Agent struct is responsible for managing conversations with the LLM
/// and coordinating tool executions. It maintains a registry of available tools
/// and handles the recursive nature of tool calls.
pub struct Agent {
    /// Client for communicating with the LLM provider
    llm_client: LiteLLMClient,
    /// Registry of available tools, mapped by their names
    tools: ToolsMap,
    /// The initial/default model identifier (can be overridden by mode)
    model: String,
    /// Flexible state storage for maintaining memory across interactions
    state: Arc<RwLock<HashMap<String, Value>>>,
    /// The current thread being processed, if any
    current_thread: Arc<RwLock<Option<AgentThread>>>,
    /// Sender for streaming messages from this agent and sub-agents
    stream_tx: Arc<RwLock<Option<broadcast::Sender<MessageResult>>>>,
    /// The user ID for the current thread
    user_id: Uuid,
    /// The session ID for the current thread
    session_id: Uuid,
    /// Agent name
    name: String,
    /// Shutdown signal sender
    shutdown_tx: Arc<RwLock<broadcast::Sender<()>>>,
    /// List of tool names that should terminate the agent loop upon successful execution.
    /// This will be managed by the ModeProvider now.
    terminating_tool_names: Arc<RwLock<Vec<String>>>,
    /// Provider for mode-specific logic (prompt, model, tools, termination)
    mode_provider: Arc<dyn ModeProvider + Send + Sync>, 
}

impl Agent {
    /// Create a new Agent instance with a specific LLM client and model
    pub fn new(
        initial_model: String,
        user_id: Uuid,
        session_id: Uuid,
        name: String,
        api_key: Option<String>,
        base_url: Option<String>,
        mode_provider: Arc<dyn ModeProvider + Send + Sync>,
    ) -> Self {
        let llm_client = LiteLLMClient::new(api_key, base_url);

        // When creating a new agent, initialize broadcast channel with higher capacity for better concurrency
        let (tx, _rx) = broadcast::channel(10000);
        // Increase shutdown channel capacity to avoid blocking
        let (shutdown_tx, _) = broadcast::channel(100);

        Self {
            llm_client,
            tools: Arc::new(RwLock::new(HashMap::new())), // Initialize empty
            model: initial_model,
            state: Arc::new(RwLock::new(HashMap::new())),
            current_thread: Arc::new(RwLock::new(None)),
            stream_tx: Arc::new(RwLock::new(Some(tx))),
            user_id,
            session_id,
            shutdown_tx: Arc::new(RwLock::new(shutdown_tx)),
            name,
            terminating_tool_names: Arc::new(RwLock::new(Vec::new())), // Initialize empty list
            mode_provider, // Store the provider
        }
    }

    /// Create a new Agent that shares state and stream with an existing agent
    pub fn from_existing(
        existing_agent: &Agent,
        name: String,
        mode_provider: Arc<dyn ModeProvider + Send + Sync>,
    ) -> Self {
        let llm_api_key = env::var("LLM_API_KEY").ok(); // Use ok() instead of expect
        let llm_base_url = env::var("LLM_BASE_URL").ok(); // Use ok() instead of expect

        let llm_client = LiteLLMClient::new(llm_api_key, llm_base_url);

        Self {
            llm_client,
            tools: Arc::new(RwLock::new(HashMap::new())), // Independent tools for sub-agent
            model: existing_agent.model.clone(),
            state: Arc::clone(&existing_agent.state), // Shared state
            current_thread: Arc::clone(&existing_agent.current_thread), // Shared thread (if needed)
            stream_tx: Arc::clone(&existing_agent.stream_tx), // Shared stream
            user_id: existing_agent.user_id,
            session_id: existing_agent.session_id,
            shutdown_tx: Arc::clone(&existing_agent.shutdown_tx), // Shared shutdown
            name,
            terminating_tool_names: Arc::new(RwLock::new(Vec::new())), // Sub-agent starts with empty term tools?
            mode_provider: Arc::clone(&mode_provider), // Share provider
        }
    }

    pub async fn get_enabled_tools(&self) -> Vec<Tool> {
        let tools = self.tools.read().await;
        let state = self.state.read().await; // Read state once

        let mut enabled_tools = Vec::new();

        for (_, registered_tool) in tools.iter() {
            // Check if condition is None (always enabled) or Some(condition) evaluates to true
            let is_enabled = match &registered_tool.enablement_condition {
                None => true, // Always enabled if no condition is specified
                Some(condition) => condition(&state),
            };

            if is_enabled {
                enabled_tools.push(Tool {
                    tool_type: "function".to_string(),
                    function: registered_tool.executor.get_schema().await,
                });
            }
        }

        enabled_tools
    }

    /// Get a new receiver for the broadcast channel.
    /// Returns an error if the stream channel has been closed or was not initialized.
    pub async fn get_stream_receiver(&self) -> Result<broadcast::Receiver<MessageResult>, AgentError> {
        match self.stream_tx.read().await.as_ref() {
            Some(tx) => Ok(tx.subscribe()),
            None => Err(AgentError("Stream channel is closed or not initialized.".to_string()))
        }
    }

    /// Get a clone of the current stream sender.
    /// Returns an error if the stream channel has been closed or was not initialized.
    pub async fn get_stream_sender(&self) -> Result<broadcast::Sender<MessageResult>, AgentError> {
        match self.stream_tx.read().await.as_ref() {
            Some(tx) => Ok(tx.clone()),
            None => Err(AgentError("Stream channel is closed or not initialized.".to_string()))
        }
    }

    /// Get a value from the agent's state by key
    pub async fn get_state_value(&self, key: &str) -> Option<Value> {
        self.state.read().await.get(key).cloned()
    }

    /// Set a value in the agent's state
    pub async fn set_state_value(&self, key: String, value: Value) {
        self.state.write().await.insert(key, value);
    }

    /// Update multiple state values at once using a closure
    pub async fn update_state<F>(&self, f: F)
    where
        F: FnOnce(&mut HashMap<String, Value>),
    {
        let mut state = self.state.write().await;
        f(&mut state);
    }

    /// Clear all state values
    pub async fn clear_state(&self) {
        self.state.write().await.clear();
    }

    // --- New Methods ---

    /// Get the current state map
    pub async fn get_state(&self) -> HashMap<String, Value> {
        self.state.read().await.clone()
    }

    /// Clear all registered tools
    pub async fn clear_tools(&self) {
        self.tools.write().await.clear();
    }

    // --- Helper state functions ---
    /// Check if a state key exists
    pub async fn state_key_exists(&self, key: &str) -> bool {
        self.state.read().await.contains_key(key)
    }

    /// Get a boolean value from state, returning None if key doesn't exist or is not a bool
    pub async fn get_state_bool(&self, key: &str) -> Option<bool> {
        self.state.read().await.get(key).and_then(|v| v.as_bool())
    }
    // --- End Helper state functions ---

    /// Get the current thread being processed, if any
    pub async fn get_current_thread(&self) -> Option<AgentThread> {
        self.current_thread.read().await.clone()
    }

    pub fn get_user_id(&self) -> Uuid {
        self.user_id
    }

    pub fn get_session_id(&self) -> Uuid {
        self.session_id
    }

    pub fn get_model_name(&self) -> &str {
        &self.model
    }

    /// Get the complete conversation history of the current thread
    pub async fn get_conversation_history(&self) -> Option<Vec<AgentMessage>> {
        self.current_thread
            .read()
            .await
            .as_ref()
            .map(|thread| thread.messages.clone())
    }

    /// Update the current thread with a new message
    async fn update_current_thread(&self, message: AgentMessage) -> Result<()> {
        let mut thread_lock = self.current_thread.write().await;
        if let Some(thread) = thread_lock.as_mut() {
            thread.messages.push(message);
        }
        Ok(())
    }

    /// Add a new tool with the agent, including its enablement condition
    ///
    /// # Arguments
    /// * `name` - The name of the tool, used to identify it in tool calls
    /// * `tool` - The tool implementation that will be executed
    /// * `enablement_condition` - An optional closure that determines if the tool is enabled based on agent state.
    ///                          If `None`, the tool is always considered enabled.
    pub async fn add_tool<T, F>(
        &self,
        name: String,
        tool: T,
        // Make the condition optional
        enablement_condition: Option<F>,
    ) where
        T: ToolExecutor + 'static,
        T::Params: serde::de::DeserializeOwned,
        T::Output: serde::Serialize,
        F: Fn(&HashMap<String, Value>) -> bool + Send + Sync + 'static,
    {
        let mut tools = self.tools.write().await;
        let value_tool = tool.into_tool_call_executor();
        let registered_tool = RegisteredTool {
            executor: Box::new(value_tool),
            // Box the closure only if it's Some
            enablement_condition: enablement_condition
                .map(|f| Box::new(f) as Box<dyn Fn(&HashMap<String, Value>) -> bool + Send + Sync>),
        };
        tools.insert(name, registered_tool);
    }

    /// Add multiple tools to the agent at once
    ///
    /// # Arguments
    /// * `tools_with_conditions` - HashMap of tool names, implementations, and optional enablement conditions
    pub async fn add_tools<E, F>(&self, tools_with_conditions: HashMap<String, (E, Option<F>)>)
    where
        E: ToolExecutor + 'static,
        E::Params: serde::de::DeserializeOwned,
        E::Output: serde::Serialize,
        F: Fn(&HashMap<String, Value>) -> bool + Send + Sync + 'static,
    {
        let mut tools_map = self.tools.write().await;
        for (name, (tool, condition)) in tools_with_conditions {
            let value_tool = tool.into_tool_call_executor();
            let registered_tool = RegisteredTool {
                executor: Box::new(value_tool),
                enablement_condition: condition.map(|f| {
                    Box::new(f) as Box<dyn Fn(&HashMap<String, Value>) -> bool + Send + Sync>
                }),
            };
            tools_map.insert(name, registered_tool);
        }
    }

    /// Process a thread of conversation, potentially executing tools and continuing
    /// the conversation recursively until a final response is reached.
    ///
    /// This is a convenience wrapper around process_thread_streaming that collects
    /// all streamed messages into a final response.
    ///
    /// # Arguments
    /// * `thread` - The conversation thread to process
    ///
    /// # Returns
    /// * A Result containing the final Message from the assistant
    pub async fn process_thread(self: &Arc<Self>, thread: &AgentThread) -> Result<AgentMessage> {
        let mut rx = self.process_thread_streaming(thread).await?;

        let mut final_message = None;
        while let Ok(msg) = rx.recv().await {
            match msg {
                Ok(AgentMessage::Done) => break,  // Stop collecting on Done message
                Ok(m) => final_message = Some(m), // Store the latest non-Done message
                Err(e) => return Err(e.into()),   // Propagate errors
            }
        }

        final_message.ok_or_else(|| anyhow::anyhow!("No final message received before Done signal"))
    }

    /// Process a thread of conversation with streaming responses. This is the primary
    /// interface for processing conversations.
    ///
    /// # Arguments
    /// * `thread` - The conversation thread to process
    ///
    /// # Returns
    /// * A Result containing a receiver for streamed messages
    pub async fn process_thread_streaming(
        self: &Arc<Self>,
        thread: &AgentThread,
    ) -> Result<broadcast::Receiver<MessageResult>> {
        // Spawn the processing task
        let agent_arc_clone = self.clone();
        let thread_clone = thread.clone();
        let agent_for_shutdown = self.clone();
        let mut shutdown_rx = agent_for_shutdown.get_shutdown_receiver().await;
        let agent_for_ok = self.clone();

        tokio::spawn(async move {
            // Clone agent here for use within the select! arms after the initial future completes
            let agent_clone_for_post_process = agent_arc_clone.clone();
            tokio::select! {
                result = Agent::process_thread_with_depth(agent_arc_clone, thread_clone.clone(), &thread_clone, 0, None, None) => {
                    if let Err(e) = result {
                        let err_msg = format!("Error processing thread: {:?}", e);
                        error!("{}", err_msg); // Log the error
                        // Use the clone created before select!
                        // Handle the Result from get_stream_sender
                        if let Ok(sender) = agent_clone_for_post_process.get_stream_sender().await {
                            if let Err(send_err) = sender.send(Err(AgentError(err_msg.clone()))) {
                               tracing::warn!("Failed to send error message to stream: {}", send_err);
                            }
                        } else {
                            tracing::warn!("Stream sender not available when trying to send error message.");
                        }
                    }
                     // Use the clone created before select!
                     // Handle the Result from get_stream_sender
                     if let Ok(sender) = agent_clone_for_post_process.get_stream_sender().await {
                         if let Err(e) = sender.send(Ok(AgentMessage::Done)) {
                            tracing::debug!("Failed to send Done message, receiver likely dropped: {}", e);
                         }
                     } else {
                         tracing::debug!("Stream sender not available when trying to send Done message.");
                     }
                },
                _ = shutdown_rx.recv() => {
                    // Use the clone created before select!
                    let agent_clone_shutdown = agent_clone_for_post_process.clone(); // Can clone the clone
                    let shutdown_msg = AgentMessage::assistant(
                        Some("shutdown_message".to_string()),
                        Some("Processing interrupted due to shutdown signal".to_string()),
                        None,
                        MessageProgress::Complete,
                        None,
                        Some(agent_clone_shutdown.name.clone()),
                    );
                    // Handle the Result from get_stream_sender
                    if let Ok(sender) = agent_clone_shutdown.get_stream_sender().await {
                        if let Err(e) = sender.send(Ok(shutdown_msg)) {
                           tracing::warn!("Failed to send shutdown notification: {}", e);
                        }
                    } else {
                        tracing::warn!("Stream sender not available when trying to send shutdown notification.");
                    }

                    // Handle the Result from get_stream_sender
                    if let Ok(sender) = agent_clone_for_post_process.clone().get_stream_sender().await {
                         if let Err(e) = sender.send(Ok(AgentMessage::Done)) {
                            tracing::debug!("Failed to send Done message after shutdown, receiver likely dropped: {}", e);
                        }
                    } else {
                        tracing::debug!("Stream sender not available when trying to send Done message after shutdown.");
                    }
                }
            }
        });

        // Handle the Result from get_stream_receiver
        agent_for_ok.get_stream_receiver().await.map_err(|e| e.into())
    }

    async fn process_thread_with_depth(
        agent: Arc<Agent>,
        thread: AgentThread,
        thread_ref: &AgentThread,
        recursion_depth: u32,
        trace_builder: Option<TraceBuilder>,
        parent_span: Option<braintrust::Span>,
    ) -> Result<()> {
        // Set the initial thread
        {
            let mut current = agent.current_thread.write().await;
            *current = Some(thread_ref.clone());
        }

        // Initialize trace and parent span if not provided (first call)
        let (trace_builder, parent_span) = if trace_builder.is_none() && parent_span.is_none() {
            if let Some(client) = &*BRAINTRUST_CLIENT {
                // Find the most recent user message to use as our input content
                let user_input_message = thread_ref
                    .messages
                    .iter()
                    .filter(|msg| matches!(msg, AgentMessage::User { .. }))
                    .last()
                    .cloned();

                // Extract the content from the user message
                let user_prompt_text = user_input_message
                    .as_ref()
                    .and_then(|msg| {
                        if let AgentMessage::User { content, .. } = msg {
                            Some(content.clone())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| "No prompt available".to_string());

                // Create a trace name with the thread ID
                let trace_name = format!("Buster Super Agent {}", thread_ref.id);

                // Create the trace with just the user prompt as input
                let trace = TraceBuilder::new(client.clone(), &trace_name);

                // Add the user prompt text (not the full message) as input to the root span
                // Ensure we're passing ONLY the content text, not the full message object
                let root_span = trace
                    .root_span()
                    .clone()
                    .with_input(serde_json::json!(user_prompt_text));

                // Add chat_id (session_id) as metadata to the root span
                let span = root_span.with_metadata("chat_id", agent.session_id.to_string());

                // Log the span non-blockingly (client handles the background processing)
                if let Err(e) = client.log_span(span.clone()).await {
                    error!("Failed to log initial span: {}", e);
                }

                (Some(trace), Some(span))
            } else {
                (None, None)
            }
        } else {
            (trace_builder, parent_span)
        };

        // Limit recursion to a maximum of 15 times
        if recursion_depth >= 15 {
            let message = AgentMessage::assistant(
                Some("max_recursion_depth_message".to_string()),
                Some("I apologize, but I've reached the maximum number of actions (15). Please try breaking your request into smaller parts.".to_string()),
                None,
                MessageProgress::Complete,
                None,
                Some(agent.name.clone()),
            );
            // Handle the Result from get_stream_sender
            if let Ok(sender) = agent.get_stream_sender().await {
                if let Err(e) = sender.send(Ok(message)) {
                    tracing::warn!(
                        "Channel send error when sending recursion limit message: {}",
                        e
                    );
                }
            } else {
                tracing::warn!("Stream sender not available when sending recursion limit message.");
            }
            agent.close().await; // Ensure stream is closed
            return Ok(()); // Don't return error, just stop processing
        }

        // --- Fetch and Apply Mode Configuration --- 
        let state = agent.get_state().await;
        let mode_config = agent.mode_provider.get_configuration_for_state(&state).await?;

        // Apply Tool Loading via the closure provided by the mode
        agent.clear_tools().await; // Clear previous mode's tools
        (mode_config.tool_loader)(&agent).await?; // Explicitly cast self

        // Apply Terminating Tools for this mode
        { // Scope for write lock
            let mut term_tools_lock = agent.terminating_tool_names.write().await;
            term_tools_lock.clear();
            term_tools_lock.extend(mode_config.terminating_tools);
        }
        // --- End Mode Configuration Application ---

        // --- Prepare LLM Messages --- 
        // Use prompt from mode_config
        let system_message = AgentMessage::developer(mode_config.prompt);
        let mut llm_messages = vec![system_message];
        llm_messages.extend(
            agent.current_thread // Use self.current_thread which is updated
                .read()
                .await
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("Current thread not set"))?
                .messages
                // Filter out previous Developer messages if desired, or keep history clean
                .iter()
                .filter(|msg| !matches!(msg, AgentMessage::Developer { .. })) 
                .cloned(),
        );
        // --- End Prepare LLM Messages ---

        // Collect all enabled tools and their schemas
        let tools = agent.get_enabled_tools().await; 

        // Get user message for logging (unchanged)
        let _user_message = thread_ref
            .messages
            .last()
            .filter(|msg| matches!(msg, AgentMessage::User { .. }))
            .cloned();

        // Create the tool-enabled request
        let request = ChatCompletionRequest {
            model: mode_config.model, // Use the model from mode config
            messages: llm_messages, 
            tools: if tools.is_empty() { None } else { Some(tools) },
            tool_choice: Some(ToolChoice::Required), // Or adjust based on mode?
            stream: Some(true), // Enable streaming
            metadata: Some(Metadata {
                generation_name: "agent".to_string(),
                user_id: thread_ref.user_id.to_string(),
                session_id: thread_ref.id.to_string(),
                trace_id: Uuid::new_v4().to_string(),
            }),
            reasoning_effort: Some("medium".to_string()),
            ..Default::default()
        };

        // Get the streaming response from the LLM
        let mut stream_rx = match agent
            .llm_client
            .stream_chat_completion(request.clone())
            .await
        {
            Ok(rx) => rx,
            Err(e) => {
                // --- Added Error Handling ---
                let error_message = format!("Error starting LLM stream: {:?}", e);
                tracing::error!(agent_name = %agent.name, chat_id = %agent.session_id, user_id = %agent.user_id, "{}", error_message);
                // Log error in span
                if let Some(parent_span) = parent_span.clone() {
                    if let Some(client) = &*BRAINTRUST_CLIENT {
                        let error_span = parent_span.with_output(serde_json::json!({
                            "error": format!("Error starting stream: {:?}", e)
                        }));

                        // Log span non-blockingly (client handles the background processing)
                        if let Err(log_err) = client.log_span(error_span).await {
                            error!("Failed to log error span: {}", log_err);
                        }
                    }
                }
                // --- End Added Error Handling ---
                return Err(anyhow::anyhow!(error_message)); // Return immediately
            }
        };

        // We store the parent span to use for creating individual tool spans
        // This avoids creating a general assistant span that would never be completed
        let parent_for_tool_spans = parent_span.clone();

        // Process the streaming chunks
        let mut buffer = MessageBuffer::new();
        let mut _is_complete = false;

        while let Some(chunk_result) = stream_rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    if chunk.choices.is_empty() {
                        continue;
                    }

                    buffer.message_id = Some(chunk.id.clone());
                    let delta = &chunk.choices[0].delta;

                    // Accumulate content if present
                    if let Some(content) = &delta.content {
                        buffer.content.push_str(content);
                    }

                    // Process tool calls if present
                    if let Some(tool_calls) = &delta.tool_calls {
                        for tool_call in tool_calls {
                            let id = tool_call.id.clone().unwrap_or_else(|| {
                                buffer
                                    .tool_calls
                                    .keys()
                                    .next()
                                    .cloned()
                                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
                            });

                            // Get or create the pending tool call
                            let pending_call = buffer.tool_calls.entry(id.clone()).or_default();

                            // Update the pending call with the delta
                            pending_call.update_from_delta(tool_call);
                        }
                    }

                    // Check if we should flush the buffer
                    if buffer.should_flush() {
                        buffer.flush(&agent).await?;
                    }

                    // Check if this is the final chunk
                    if chunk.choices[0].finish_reason.is_some() {
                        _is_complete = true;
                    }
                }
                Err(e) => {
                    // --- Added Error Handling ---
                    let error_message = format!("Error receiving chunk from LLM stream: {:?}", e);
                    tracing::error!(agent_name = %agent.name, chat_id = %agent.session_id, user_id = %agent.user_id, "{}", error_message);
                    // Log error in parent span
                    if let Some(parent) = &parent_for_tool_spans {
                        if let Some(client) = &*BRAINTRUST_CLIENT {
                            // Create error info
                            let error_info = serde_json::json!({
                                "error": format!("Error in stream: {:?}", e)
                            });

                            // Log error as output to parent span
                            let error_span = parent.clone().with_output(error_info);

                            // Log span non-blockingly (client handles the background processing)
                            if let Err(log_err) = client.log_span(error_span).await {
                                error!("Failed to log stream error span: {}", log_err);
                            }
                        }
                    }
                    // --- End Added Error Handling ---
                    return Err(anyhow::anyhow!(error_message)); // Return immediately
                }
            }
        }

        // Flush any remaining buffered content or tool calls before creating final message
        buffer.flush(&agent).await?;

        // Create and send the final message
        let final_tool_calls: Option<Vec<ToolCall>> = if !buffer.tool_calls.is_empty() {
            Some(
                buffer
                    .tool_calls
                    .values()
                    .map(|p| p.clone().into_tool_call())
                    .collect(),
            )
        } else {
            None
        };

        let final_message = AgentMessage::assistant(
            buffer.message_id,
            if buffer.content.is_empty() {
                None
            } else {
                Some(buffer.content)
            },
            final_tool_calls.clone(),
            MessageProgress::Complete,
            Some(false), // Never the first message at this stage
            Some(agent.name.clone()),
        );

        // Broadcast the final assistant message
        // Ensure we don't block if the receiver dropped
        // Handle the Result from get_stream_sender
        if let Ok(sender) = agent.get_stream_sender().await {
             if let Err(e) = sender.send(Ok(final_message.clone())) {
                tracing::debug!(
                    "Failed to send final assistant message (receiver likely dropped): {}",
                    e
                );
            }
        } else {
            tracing::debug!("Stream sender not available when sending final assistant message.");
        }

        // Update thread with assistant message
        agent.update_current_thread(final_message.clone()).await?;

        // Get the updated thread state AFTER adding the final assistant message
        // This will be used for the potential recursive call later.
        let mut updated_thread_for_recursion = agent
            .current_thread
            .read()
            .await
            .as_ref()
            .cloned()
            .ok_or_else(|| {
            anyhow::anyhow!("Failed to get updated thread state after adding assistant message")
        })?;

        // --- Tool Execution Logic ---
        // If the LLM wants to use tools, execute them
        if let Some(tool_calls) = final_tool_calls {
            let mut results = Vec::new();
            let agent_tools = agent.tools.read().await; // Read tools once
            let terminating_names = agent.terminating_tool_names.read().await; // Read terminating names once

            // Execute each requested tool
            let mut should_terminate = false; // Flag to indicate if loop should terminate after this tool
            for tool_call in tool_calls {
                // Find the registered tool entry
                if let Some(registered_tool) = agent_tools.get(&tool_call.function.name) {
                    // Create a tool span that combines the assistant request with the tool execution
                    let tool_span = if let (Some(trace), Some(parent)) =
                        (&trace_builder, &parent_for_tool_spans)
                    {
                        if let Some(_client) = &*BRAINTRUST_CLIENT {
                            // Create a span for the assistant + tool execution
                            let span = trace
                                .add_child_span(
                                    &format!("Assistant: {}", tool_call.function.name),
                                    "tool",
                                    parent,
                                )
                                .await?;

                            // Add chat_id (session_id) as metadata to the span
                            let span = span.with_metadata("chat_id", agent.session_id.to_string());

                            // Parse the parameters (unused in this context since we're using final_message)
                            let _params: Value =
                                serde_json::from_str(&tool_call.function.arguments)?;

                            // Use the assistant message as input to this span
                            // This connects the assistant's request to the tool execution
                            let span = span.with_input(serde_json::to_value(&final_message)?);

                            // We don't log the span yet - we'll log it after we have the tool result
                            // The tool result will be added as output to this span

                            Some(span)
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    // Parse the parameters
                    let params: Value = match serde_json::from_str(&tool_call.function.arguments) {
                        Ok(p) => p,
                        Err(e) => {
                            let err_msg = format!(
                                "Failed to parse tool arguments for {}: {}",
                                tool_call.function.name, e
                            );
                            error!("{}", err_msg);
                            // Optionally log to Braintrust span here
                            return Err(anyhow::anyhow!(err_msg));
                        }
                    };

                    let _tool_input = serde_json::json!({
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": params.clone() // Clone params for logging
                        },
                        "id": tool_call.id
                    });

                    // Execute the tool using the executor from RegisteredTool
                    let result = match registered_tool
                        .executor
                        .execute(params, tool_call.id.clone())
                        .await
                    {
                        Ok(r) => r,
                        Err(e) => {
                            // --- Added Error Handling ---
                            let error_message = format!(
                                "Tool execution error for {}: {:?}",
                                tool_call.function.name, e
                            );
                            tracing::error!(agent_name = %agent.name, chat_id = %agent.session_id, user_id = %agent.user_id, tool_name = %tool_call.function.name, "{}", error_message);
                            // Log error in tool span
                            if let Some(tool_span) = &tool_span {
                                if let Some(client) = &*BRAINTRUST_CLIENT {
                                    let error_info = serde_json::json!({
                                        "error": format!("Tool execution error: {:?}", e)
                                    });

                                    // Create a new span with the error output
                                    let error_span = tool_span.clone().with_output(error_info);

                                    // Log span non-blockingly (client handles the background processing)
                                    if let Err(log_err) = client.log_span(error_span).await {
                                        error!(
                                            "Failed to log tool execution error span: {}",
                                            log_err
                                        );
                                    }
                                }
                            }
                            // --- End Added Error Handling ---
                            let error_message = format!(
                                "Tool execution error for {}: {:?}",
                                tool_call.function.name, e
                            );
                            error!("{}", error_message); // Log locally
                            return Err(anyhow::anyhow!(error_message)); // Return immediately
                        }
                    };

                    let result_str = serde_json::to_string(&result)?;
                    let tool_message = AgentMessage::tool(
                        None,
                        result_str.clone(),
                        tool_call.id.clone(),
                        Some(tool_call.function.name.clone()),
                        MessageProgress::Complete,
                    );

                    // Log the combined assistant+tool span with the tool result as output
                    if let Some(tool_span) = &tool_span {
                        if let Some(client) = &*BRAINTRUST_CLIENT {
                            // Only log completed messages
                            if matches!(
                                tool_message,
                                AgentMessage::Tool {
                                    progress: MessageProgress::Complete,
                                    ..
                                }
                            ) {
                                // Now that we have the tool result, add it as output and log the span
                                // This creates a span showing assistant message -> tool execution -> tool result
                                let result_span = tool_span
                                    .clone()
                                    .with_output(serde_json::to_value(&tool_message)?);

                                // Log span non-blockingly (client handles the background processing)
                                if let Err(log_err) = client.log_span(result_span).await {
                                    error!("Failed to log tool result span: {}", log_err);
                                }
                            }
                        }
                    }

                    // Broadcast the tool message as soon as we receive it - use try_send to avoid blocking
                    // Handle the Result from get_stream_sender
                    if let Ok(sender) = agent.get_stream_sender().await {
                        if let Err(e) = sender.send(Ok(tool_message.clone())) {
                            tracing::debug!(
                                "Failed to send tool message (receiver likely dropped): {}",
                                e
                            );
                        }
                    } else {
                        tracing::debug!("Stream sender not available when sending tool message.");
                    }

                    // Update thread with tool response BEFORE checking termination
                    agent.update_current_thread(tool_message.clone()).await?;
                    results.push(tool_message);

                    // Check if this tool's name is in the terminating list
                    if terminating_names.contains(&tool_call.function.name) {
                        should_terminate = true;
                        tracing::info!(
                            "Tool '{}' triggered agent termination.",
                            tool_call.function.name
                        );
                        break; // Exit the tool execution loop
                    }
                } else {
                    // Handle case where the LLM hallucinated a tool name
                    let err_msg = format!(
                        "Attempted to call non-existent tool: {}",
                        tool_call.function.name
                    );
                    error!("{}", err_msg);
                    // Create a fake tool result indicating the error
                    let error_result = AgentMessage::tool(
                        None,
                        serde_json::json!({"error": err_msg}).to_string(),
                        tool_call.id.clone(),
                        Some(tool_call.function.name.clone()),
                        MessageProgress::Complete,
                    );
                    // Broadcast the error message
                    // Handle the Result from get_stream_sender
                    if let Ok(sender) = agent.get_stream_sender().await {
                         if let Err(e) = sender.send(Ok(error_result.clone())) {
                            tracing::debug!(
                                "Failed to send tool error message (receiver likely dropped): {}",
                                e
                            );
                        }
                    } else {
                         tracing::debug!("Stream sender not available when sending tool error message.");
                    }
                    // Update thread and push the error result for the next LLM call
                    agent.update_current_thread(error_result.clone()).await?;
                    // Continue processing other tool calls if any
                    // --- Added: Consider returning error here if hallucinated tool is fatal ---
                    // return Err(anyhow::anyhow!(err_msg)); // Uncomment if hallucinated tools should stop processing
                    // --- End Added ---
                }
            }

            // If a tool signaled termination, finish trace, send Done and exit.
            if should_terminate {
                // Finish the trace without consuming it
                agent.finish_trace(&trace_builder).await?;
                // Send Done message
                // Handle the Result from get_stream_sender
                if let Ok(sender) = agent.get_stream_sender().await {
                    if let Err(e) = sender.send(Ok(AgentMessage::Done)) {
                        tracing::debug!("Failed to send Done message after tool termination (receiver likely dropped): {}", e);
                    }
                } else {
                    tracing::debug!("Stream sender not available when sending Done message after tool termination.");
                }
                return Ok(()); // Exit the function, preventing recursion
            }

            // Add the tool results to the thread state for the recursive call
            updated_thread_for_recursion.messages.extend(results);
        } else {
            // Log the final assistant response span only if NO tools were called
            if let (Some(trace), Some(parent)) = (&trace_builder, &parent_span) {
                if let Some(client) = &*BRAINTRUST_CLIENT {
                    // Ensure we have the complete message content
                    let complete_final_message = final_message.clone();

                    // Create a fresh span for the text-only response
                    let span = trace
                        .add_child_span("Assistant Response", "llm", parent)
                        .await?;
                    let span = span.with_metadata("chat_id", agent.session_id.to_string());
                    let span = span.with_input(serde_json::to_value(&request)?); // Log the request
                    let span = span.with_output(serde_json::to_value(&complete_final_message)?); // Log the response

                    // Log span non-blockingly
                    if let Err(log_err) = client.log_span(span).await {
                        error!("Failed to log assistant response span: {}", log_err);
                    }
                }
            }

            // Also log the final output to the parent span if no tools were called
            if let Some(parent_span) = &parent_span {
                if let Some(client) = &*BRAINTRUST_CLIENT {
                    let final_span = parent_span
                        .clone()
                        .with_output(serde_json::to_value(&final_message)?);
                    if let Err(log_err) = client.log_span(final_span).await {
                        error!("Failed to log final output span: {}", log_err);
                    }
                }
            }
            // --- End Logging for Text-Only Response ---
        }

        // Continue the conversation recursively using the updated thread state,
        // unless a terminating tool caused an early return above.
        // This call happens regardless of whether tools were executed in this step.
        let agent_for_recursion = agent.clone();
        Box::pin(Agent::process_thread_with_depth(
            agent_for_recursion,
            updated_thread_for_recursion.clone(),
            &updated_thread_for_recursion,
            recursion_depth + 1,
            trace_builder,
            parent_span,
        ))
        .await
    }

    /// Get a receiver for the shutdown signal
    pub async fn get_shutdown_receiver(&self) -> broadcast::Receiver<()> {
        self.shutdown_tx.read().await.subscribe()
    }

    /// Signal shutdown to all receivers
    pub async fn shutdown(&self) -> Result<()> {
        // Send shutdown signal
        self.shutdown_tx.read().await.send(())?;
        Ok(())
    }

    /// Get a read lock on the tools map (Exposes RegisteredTool now)
    pub async fn get_tools_map(
        &self,
    ) -> tokio::sync::RwLockReadGuard<'_, HashMap<String, RegisteredTool>> {
        self.tools.read().await
    }

    /// Helper method to finish a trace without consuming the TraceBuilder
    /// This method is fully non-blocking and never affects application performance
    async fn finish_trace(&self, trace: &Option<TraceBuilder>) -> Result<()> {
        // If there's no trace to finish or no client to log with, return immediately
        if trace.is_none() || BRAINTRUST_CLIENT.is_none() {
            return Ok(());
        }

        // Only create a completion span if we have an actual trace
        if let Some(trace_builder) = trace {
            // Get the trace root span ID to properly link the completion
            let root_span_id = trace_builder.root_span_id();

            // Create and log a completion span non-blockingly
            if let Some(client) = &*BRAINTRUST_CLIENT {
                // Create a new span for completion linked to the trace
                let completion_span = client
                    .create_span(
                        "Trace Completion",
                        "completion",
                        Some(root_span_id), // Link to the trace's root span
                        Some(root_span_id), // Set parent to also be the root span
                    )
                    .with_metadata("chat_id", self.session_id.to_string());

                // Log span non-blockingly (client handles the background processing)
                if let Err(e) = client.log_span(completion_span).await {
                    error!("Failed to log completion span: {}", e);
                }
            }
        }

        // Return immediately, without waiting for any logging operations
        Ok(())
    }

    // Add this new method alongside other channel-related methods
    pub async fn close(&self) {
        let mut tx = self.stream_tx.write().await;
        *tx = None;
    }
}

#[derive(Debug, Default, Clone)]
struct PendingToolCall {
    id: Option<String>,
    call_type: Option<String>,
    function_name: Option<String>,
    arguments: String,
    code_interpreter: Option<Value>,
    retrieval: Option<Value>,
}

impl PendingToolCall {
    #[allow(dead_code)]
    fn new() -> Self {
        Self::default()
    }

    fn update_from_delta(&mut self, tool_call: &DeltaToolCall) {
        if let Some(id) = &tool_call.id {
            self.id = Some(id.clone());
        }
        if let Some(call_type) = &tool_call.call_type {
            self.call_type = Some(call_type.clone());
        }
        if let Some(function) = &tool_call.function {
            if let Some(name) = &function.name {
                self.function_name = Some(name.clone());
            }
            if let Some(args) = &function.arguments {
                self.arguments.push_str(args);
            }
        }
        if tool_call.code_interpreter.is_some() {
            self.code_interpreter = None;
        }
        if tool_call.retrieval.is_some() {
            self.retrieval = None;
        }
    }

    fn into_tool_call(self) -> ToolCall {
        ToolCall {
            id: self.id.unwrap_or_default(),
            function: FunctionCall {
                name: self.function_name.unwrap_or_default(),
                arguments: self.arguments,
            },
            call_type: self.call_type.unwrap_or_default(),
            code_interpreter: None,
            retrieval: None,
        }
    }
}

/// A trait that provides convenient access to Agent functionality
/// when the agent is stored behind an Arc
#[async_trait::async_trait]
pub trait AgentExt {
    fn get_agent_arc(&self) -> &Arc<Agent>;

    async fn stream_process_thread(
        &self,
        thread: &AgentThread,
    ) -> Result<broadcast::Receiver<MessageResult>> {
        self.get_agent_arc().process_thread_streaming(thread).await
    }

    async fn process_thread(&self, thread: &AgentThread) -> Result<AgentMessage> {
        self.get_agent_arc().process_thread(thread).await
    }

    async fn get_current_thread(&self) -> Option<AgentThread> {
        (*self.get_agent_arc()).get_current_thread().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::ToolExecutor;
    use async_trait::async_trait;
    use litellm::MessageProgress;
    use serde_json::{json, Value};
    use uuid::Uuid;

    // --- Mock Mode Provider for Testing ---
    struct MockModeProvider;

    impl MockModeProvider {
        fn new() -> Self {
            Self
        }
    }

    #[async_trait::async_trait]
    impl ModeProvider for MockModeProvider {
        async fn get_configuration_for_state(&self, _state: &HashMap<String, Value>) -> Result<ModeConfiguration> {
            // Return a default/empty configuration for testing basic agent functions
            Ok(ModeConfiguration {
                prompt: "Test Prompt".to_string(),
                model: "test-model".to_string(),
                tool_loader: Box::new(|_agent_arc| Box::pin(async { Ok(()) })), // No-op loader
                terminating_tools: vec![],
            })
        }
    }
    // --- End Mock Mode Provider ---

    fn setup() {
        dotenv::dotenv().ok();
    }

    struct WeatherTool {
        agent: Arc<Agent>,
    }

    impl WeatherTool {
        fn new(agent: Arc<Agent>) -> Self {
            Self { agent }
        }
    }

    impl WeatherTool {
        async fn send_progress(
            &self,
            content: String,
            tool_id: String,
            progress: MessageProgress,
        ) -> Result<()> {
            let message =
                AgentMessage::tool(None, content, tool_id, Some(self.get_name()), progress);
            self.agent.get_stream_sender().await?.send(Ok(message))?;
            Ok(())
        }
    }

    #[async_trait]
    impl ToolExecutor for WeatherTool {
        type Output = Value;
        type Params = Value;

        async fn execute(
            &self,
            params: Self::Params,
            tool_call_id: String,
        ) -> Result<Self::Output> {
            self.send_progress(
                "Fetching weather data...".to_string(),
                tool_call_id.clone(), // Use the actual tool_call_id
                MessageProgress::InProgress,
            )
            .await?;

            let _params = params.as_object().unwrap();

            // Simulate a delay
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            let result = json!({
                "temperature": 20,
                "unit": "fahrenheit"
            });

            // Tool itself should just return the result, Agent handles sending the final tool message
            Ok(result)
        }

        async fn get_schema(&self) -> Value {
            json!({
                "name": "get_weather",
                "description": "Get current weather information for a specific location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g., San Francisco, CA"
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "description": "The temperature unit to use"
                        }
                    },
                    "required": ["location"]
                }
            })
        }

        fn get_name(&self) -> String {
            "get_weather".to_string()
        }
    }

    #[tokio::test]
    async fn test_agent_convo_no_tools() {
        setup();

        // Use MockModeProvider
        let mock_provider = Arc::new(MockModeProvider::new());
        let agent = Arc::new(Agent::new(
            "o1".to_string(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            "test_agent_no_tools".to_string(),
            env::var("LLM_API_KEY").ok(),
            env::var("LLM_BASE_URL").ok(),
            mock_provider, 
        ));

        let thread = AgentThread::new(
            None,
            Uuid::new_v4(),
            vec![AgentMessage::user("Hello, world!".to_string())],
        );

        // Use Arc<Agent> for process_thread call
        let _response = match agent.process_thread(&thread).await {
            Ok(response) => {
                println!("Response (no tools): {:?}", response);
                response
            }
            Err(e) => panic!("Error processing thread: {:?}", e),
        };
    }

    #[tokio::test]
    async fn test_agent_convo_with_tools() {
        setup();

        // Use MockModeProvider
        let mock_provider = Arc::new(MockModeProvider::new());
        let agent = Arc::new(Agent::new(
            "o1".to_string(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            "test_agent_with_tools".to_string(),
            env::var("LLM_API_KEY").ok(),
            env::var("LLM_BASE_URL").ok(),
            mock_provider,
        ));

        // Create weather tool with reference to agent
        let weather_tool = WeatherTool::new(Arc::clone(&agent));
        let tool_name = weather_tool.get_name();
        let condition = |_state: &HashMap<String, Value>| true; // Always enabled

        // Add tool to agent
        agent
            .add_tool(tool_name, weather_tool, Some(condition))
            .await;

        let thread = AgentThread::new(
            None,
            Uuid::new_v4(),
            vec![AgentMessage::user(
                "What is the weather in vineyard ut?".to_string(),
            )],
        );

        // Use Arc<Agent> for process_thread call
        let _response = match agent.process_thread(&thread).await {
            Ok(response) => {
                println!("Response (with tools): {:?}", response);
                response
            }
            Err(e) => panic!("Error processing thread: {:?}", e),
        };
    }

    #[tokio::test]
    async fn test_agent_with_multiple_steps() {
        setup();

        // Use MockModeProvider
        let mock_provider = Arc::new(MockModeProvider::new());
        let agent = Arc::new(Agent::new(
            "o1".to_string(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            "test_agent_multi_step".to_string(),
            env::var("LLM_API_KEY").ok(),
            env::var("LLM_BASE_URL").ok(),
            mock_provider,
        ));

        let weather_tool = WeatherTool::new(Arc::clone(&agent));

        let tool_name = weather_tool.get_name();
        let condition = |_state: &HashMap<String, Value>| true; // Always enabled

        agent
            .add_tool(tool_name, weather_tool, Some(condition))
            .await;

        let thread = AgentThread::new(
            None,
            Uuid::new_v4(),
            vec![AgentMessage::user(
                "What is the weather in vineyard ut and san francisco?".to_string(),
            )],
        );

        // Use Arc<Agent> for process_thread call
        let _response = match agent.process_thread(&thread).await {
            Ok(response) => {
                println!("Response (multi-step): {:?}", response);
                response
            }
            Err(e) => panic!("Error processing thread: {:?}", e),
        };
    }

    #[tokio::test]
    async fn test_agent_disabled_tool() {
        setup();

        // Use MockModeProvider
        let mock_provider = Arc::new(MockModeProvider::new());
        let agent = Arc::new(Agent::new(
            "o1".to_string(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            "test_agent_disabled".to_string(),
            env::var("LLM_API_KEY").ok(),
            env::var("LLM_BASE_URL").ok(),
            mock_provider, 
        ));

        // Create weather tool
        let weather_tool = WeatherTool::new(Arc::clone(&agent));
        let tool_name = weather_tool.get_name();
        // Condition: only enabled if "weather_enabled" state is true
        let condition = |state: &HashMap<String, Value>| -> bool {
            state
                .get("weather_enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        };

        // Add tool with the condition
        agent
            .add_tool(tool_name, weather_tool, Some(condition))
            .await;

        // --- Test case 1: Tool disabled ---
        let thread_disabled = AgentThread::new(
            None,
            Uuid::new_v4(),
            vec![AgentMessage::user(
                "What is the weather in Provo?".to_string(),
            )],
        );
        // Ensure state doesn't enable the tool
        agent
            .set_state_value("weather_enabled".to_string(), json!(false))
            .await;

        // Use Arc<Agent> for process_thread call
        let response_disabled = match agent.process_thread(&thread_disabled).await {
            Ok(response) => response,
            Err(e) => panic!("Error processing thread (disabled): {:?}", e),
        };
        // Expect response without tool call
        if let AgentMessage::Assistant {
            tool_calls: Some(_),
            ..
        } = response_disabled
        {
            panic!("Tool call occurred even when disabled");
        }
        println!("Response (disabled tool): {:?}", response_disabled);

        // --- Test case 2: Tool enabled ---
        let thread_enabled = AgentThread::new(
            None,
            Uuid::new_v4(),
            vec![AgentMessage::user(
                "What is the weather in Orem?".to_string(),
            )],
        );
        // Set state to enable the tool
        agent
            .set_state_value("weather_enabled".to_string(), json!(true))
            .await;

        // Use Arc<Agent> for process_thread call
        let _response_enabled = match agent.process_thread(&thread_enabled).await {
            Ok(response) => response,
            Err(e) => panic!("Error processing thread (enabled): {:?}", e),
        };
        // Expect response *with* tool call (or final answer after tool call)
        // We can't easily check the intermediate step here, but the test should run without panic
        println!("Response (enabled tool): {:?}", _response_enabled);
    }

    #[tokio::test]
    async fn test_agent_state_management() {
        setup();

        // Use MockModeProvider
        let mock_provider = Arc::new(MockModeProvider::new());
        let agent = Arc::new(Agent::new(
            "o1".to_string(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            "test_agent_state".to_string(),
            env::var("LLM_API_KEY").ok(),
            env::var("LLM_BASE_URL").ok(),
            mock_provider,
        ));

        // Test setting single values
        agent
            .set_state_value("test_key".to_string(), json!("test_value"))
            .await;
        let value = agent.get_state_value("test_key").await;
        assert_eq!(value, Some(json!("test_value")));
        assert!(agent.state_key_exists("test_key").await);
        assert_eq!(agent.get_state_bool("test_key").await, None); // Not a bool

        // Test setting boolean value
        agent
            .set_state_value("bool_key".to_string(), json!(true))
            .await;
        assert_eq!(agent.get_state_bool("bool_key").await, Some(true));

        // Test updating multiple values
        agent
            .update_state(|state| {
                state.insert("key1".to_string(), json!(1));
                state.insert("key2".to_string(), json!({"nested": "value"}));
            })
            .await;

        assert_eq!(agent.get_state_value("key1").await, Some(json!(1)));
        assert_eq!(
            agent.get_state_value("key2").await,
            Some(json!({"nested": "value"}))
        );

        // Test clearing state
        agent.clear_state().await;
        assert_eq!(agent.get_state_value("test_key").await, None);
        assert_eq!(agent.get_state_value("key1").await, None);
        assert_eq!(agent.get_state_value("key2").await, None);
        assert!(!agent.state_key_exists("test_key").await);
        assert_eq!(agent.get_state_bool("bool_key").await, None);
    }
}
