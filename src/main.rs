use anyhow::Result;
use clap::Parser;
use deloxide::showcase;
use std::path::PathBuf;

/// Deloxide CLI - Cross-Language Deadlock Detector with Visualization
///
/// This command-line tool provides visualization functionality for deadlock detection logs
/// generated by the Deloxide library. It processes a log file and opens a web browser to
/// display the thread-lock relationships in an interactive visualization.
///
/// The visualization helps you understand the patterns that led to a deadlock, making it
/// easier to diagnose and fix concurrency issues in your application.
#[derive(Parser)]
#[command(
    author,
    version,
    about = "Deloxide - Cross-Language Deadlock Detector With Visualization Support"
)]
struct Cli {
    /// Path to the log file to visualize
    ///
    /// This should be a JSON log file produced by Deloxide's logging functionality.
    /// The file contains records of thread-lock interactions that will be visualized.
    log_file: PathBuf,
}

/// Main entry point for the Deloxide CLI application
///
/// This function parses command-line arguments and launches the visualization
/// for the specified log file.
///
/// # Returns
/// A Result that is Ok if the visualization was successful, or an error if it failed
///
/// # Errors
/// Returns an error if:
/// - The log file could not be read
/// - The log file could not be processed
/// - The browser could not be opened
fn main() -> Result<()> {
    let cli = Cli::parse();
    showcase(cli.log_file)?;
    Ok(())
}
