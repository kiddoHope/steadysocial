
import React from 'react';
import Card from '../components/ui/Card';
import { APP_NAME, APP_TAGLINE } from '../constants';

const AboutUsPage: React.FC = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <Card title={`About ${APP_NAME}`} className="max-w-4xl mx-auto">
        <div className="space-y-4 text-slate-700 dark:text-slate-300">
          <p className="text-lg italic">{APP_TAGLINE}</p>
          
          <p>{APP_NAME} is a demonstration application designed to showcase how AI, specifically client-side WebLLM and potentially Google Gemini API, can be integrated into a modern web application to assist with social media content generation and management. This application is built with React, TypeScript, and Tailwind CSS, focusing on a clean user interface and practical features for creative professionals and administrators.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Our Mission (Conceptual)</h2>
          <p>While {APP_NAME} is a portfolio or demonstration project, its conceptual mission is to empower social media managers and content creators by providing intelligent tools that streamline workflows, spark creativity, and help maintain a consistent and impactful online presence. We believe in leveraging the power of AI to augment human creativity, not replace it.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Key Features Demonstrated</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>AI-Powered Content Generation:</strong> Utilizing local WebLLM models for generating post ideas, captions, and adaptations for various social media platforms.</li>
            <li><strong>Content Canvas:</strong> A workspace for developing multiple content ideas from a central theme, adapting them for different platforms, and managing their approval status.</li>
            <li><strong>Role-Based Access Control:</strong> Differentiating features and access for 'Creative' and 'Admin' roles.</li>
            <li><strong>Post Management Dashboard:</strong> An overview of content canvases, their statuses, and actions based on user role.</li>
            <li><strong>Theme Customization:</strong> Light and Dark mode support.</li>
            <li><strong>User Profile Management:</strong> Allowing users to update their profile information.</li>
            <li><strong>Integrated AI Chatbot:</strong> An assistant powered by WebLLM to help with queries and content suggestions.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Technology Stack</h2>
          <p>{APP_NAME} leverages a modern frontend stack:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>React:</strong> For building a dynamic and responsive user interface.</li>
            <li><strong>TypeScript:</strong> For robust, type-safe JavaScript development.</li>
            <li><strong>Tailwind CSS:</strong> For utility-first CSS styling.</li>
            <li><strong>WebLLM (@mlc-ai/web-llm):</strong> For running large language models directly in the browser. (Or @google/genai for Gemini integration).</li>
            <li><strong>React Router:</strong> For client-side routing.</li>
            <li><strong>Context API:</strong> For state management.</li>
            <li><strong>Local Storage:</strong> For persisting application data (users, posts, settings) in the browser. No backend database is used in this demo.</li>
          </ul>
          
          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Disclaimer</h2>
          <p>This application is for demonstration and educational purposes. The AI models used (e.g., WebLLM) run locally in your browser and do not send your data to external servers for processing in their default configuration for WebLLM. If Google Gemini API is used, data is sent to Google's servers as per their API terms and privacy policy. Data such as user accounts and content created are stored in your browser's local storage and are not centrally hosted.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Future Ideas (Conceptual)</h2>
          <p>If this were a real product, future development could include:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Direct integration with social media platform APIs for scheduling and posting.</li>
            <li>Advanced analytics on post performance.</li>
            <li>Team collaboration features beyond basic roles.</li>
            <li>A wider range of AI models and more sophisticated prompt engineering.</li>
            <li>A proper backend and database for persistent, shared data.</li>
            <li>Enhanced accessibility features.</li>
          </ul>

          <p>Thank you for exploring {APP_NAME}!</p>
        </div>
      </Card>
    </div>
  );
};
export default AboutUsPage;
