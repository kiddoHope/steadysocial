
import React from 'react';
import Card from '../components/ui/Card';
import { APP_NAME } from '../constants';

const TermsPage: React.FC = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <Card title="Terms and Conditions" className="max-w-4xl mx-auto">
        <div className="space-y-4 text-slate-700 dark:text-slate-300">
          <p className="text-sm">Last updated: {new Date().toLocaleDateString()}</p>
          <p>Please read these terms and conditions carefully before using Our Service.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Interpretation and Definitions</h2>
          <p>The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions shall have the same meaning regardless of whether they appear in singular or in plural.</p>
          
          <h3 className="text-lg font-semibold mt-4 mb-1 text-slate-800 dark:text-slate-100">Definitions</h3>
          <p>For the purposes of these Terms and Conditions:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Application</strong> means the software program provided by {APP_NAME} accessed by You on any electronic device, named {APP_NAME}.</li>
            <li><strong>Company</strong> (referred to as either "the Company", "We", "Us" or "Our" in this Agreement) refers to {APP_NAME}.</li>
            <li><strong>Service</strong> refers to the Application.</li>
            <li><strong>Terms and Conditions</strong> (also referred as "Terms") mean these Terms and Conditions that form the entire agreement between You and the Company regarding the use of the Service.</li>
            <li><strong>You</strong> means the individual accessing or using the Service, or the company, or other legal entity on behalf of which such individual is accessing or using the Service, as applicable.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Acknowledgment</h2>
          <p>These are the Terms and Conditions governing the use of this Service and the agreement that operates between You and the Company. These Terms and Conditions set out the rights and obligations of all users regarding the use of the Service.</p>
          <p>By accessing or using the Service You agree to be bound by these Terms and Conditions. If You disagree with any part of these Terms and Conditions then You may not access the Service.</p>
          <p>Your access to and use of the Service is also conditioned on Your acceptance of and compliance with the Privacy Policy of {APP_NAME}. Our Privacy Policy describes Our policies and procedures on the collection, use and disclosure of Your personal information when You use the Application or the Website and tells You about Your privacy rights and how the law protects You. Please read Our Privacy Policy carefully before using Our Service.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">User Accounts</h2>
          <p>When You create an account with Us, You must provide Us information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of Your account on Our Service.</p>
          <p>You are responsible for safeguarding the password that You use to access the Service and for any activities or actions under Your password, whether Your password is with Our Service or a third-party social media service. You agree not to disclose Your password to any third party. You must notify Us immediately upon becoming aware of any breach of security or unauthorized use of Your account.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Content</h2>
          <p>Our Service allows You to post, link, store, share and otherwise make available certain information, text, graphics, videos, or other material ("Content"). You are responsible for the Content that You post to the Service, including its legality, reliability, and appropriateness.</p>
          <p>By posting Content to the Service, You grant Us the right and license to use, modify, publicly perform, publicly display, reproduce, and distribute such Content on and through the Service. You retain any and all of Your rights to any Content You submit, post or display on or through the Service and You are responsible for protecting those rights. This application primarily stores data locally in your browser; be mindful of this when considering content persistence and sharing.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Intellectual Property</h2>
          <p>The Service and its original content (excluding Content provided by You or other users), features and functionality are and will remain the exclusive property of {APP_NAME} and its licensors. The Service is protected by copyright, trademark, and other laws of both the Your Country and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of the Company.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Termination</h2>
          <p>We may terminate or suspend Your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if You breach these Terms and Conditions.</p>
          <p>Upon termination, Your right to use the Service will cease immediately.</p>
          
          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Limitation of Liability</h2>
          <p>Notwithstanding any damages that You might incur, the entire liability of the Company and any of its suppliers under any provision of this Terms and Your exclusive remedy for all of the foregoing shall be limited to the amount actually paid by You through the Service or 100 USD if You haven't purchased anything through the Service.</p>
          <p>To the maximum extent permitted by applicable law, in no event shall the Company or its suppliers be liable for any special, incidental, indirect, or consequential damages whatsoever (including, but not limited to, damages for loss of profits, loss of data or other information, for business interruption, for personal injury, loss of privacy arising out of or in any way related to the use of or inability to use the Service, third-party software and/or third-party hardware used with the Service, or otherwise in connection with any provision of this Terms), even if the Company or any supplier has been advised of the possibility of such damages and even if the remedy fails of its essential purpose.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Governing Law</h2>
          <p>The laws of the Country, excluding its conflicts of law rules, shall govern this Terms and Your use of the Service. Your use of the Application may also be subject to other local, state, national, or international laws.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Changes to These Terms and Conditions</h2>
          <p>We reserve the right, at Our sole discretion, to modify or replace these Terms at any time. If a revision is material We will make reasonable efforts to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at Our sole discretion.</p>
          <p>By continuing to access or use Our Service after those revisions become effective, You agree to be bound by the revised terms. If You do not agree to the new terms, in whole or in part, please stop using the website and the Service.</p>

          <h2 className="text-xl font-semibold mt-6 mb-2 text-slate-800 dark:text-slate-100">Contact Us</h2>
          <p>If you have any questions about these Terms and Conditions, You can contact us:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>By email: contact@example.com (Replace with actual contact)</li>
            <li>By visiting this page on our website: [Link to Contact Page if exists]</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};
export default TermsPage;
